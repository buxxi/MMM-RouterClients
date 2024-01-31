/**
 * Connects to a Asus router via HTTP/HTTPS/SSH.
 * There's no official API available so it's mostly reverse engineering and could break if updating firmware.
 * Confirmed working devices:
 *  TUF-AX5400
 */
import {RouterProvider,RouterInterface,RouterClient,RouterInterfaceType} from "../routerprovider.mjs";
import {NodeSSH} from 'node-ssh';

class AsusDelegatingRouterProvider extends RouterProvider {
    constructor(config) {
        super(config);
        if (!["ssh", "http", "https"].includes(config.protocol)) {
            throw new Error(`${config.protocol} is not a valid protocol when connecting to asus router`);
        }
        if (!config.host) {
            throw new Error("host is required when connecting to asus router");
        }
        this.delegate = config.protocol == "ssh" ? new AsusSshRouterProvider(config) : new AsusWebRouterProvider(config);
    }

    async connect() {
        return this.delegate.connect();
    }

    async getInterfaces(session) {
        return this.delegate.getInterfaces(session);
    }

    async dispose(session) {
        return this.delegate.disconnect(session);
    }
}

/**
    Connects to the Asus Router via SSH, needs to be enabled in the router.
 */
class AsusSshRouterProvider extends RouterProvider {
    constructor(config) {
        super(config);
        this.username = config.username;
        this.password = config.password;
        this.host = config.host;
        this.port = config.port;
        this.privateKey = config.privateKey;
        this.privateKeyPath = config.privateKeyPath;
        if (!this.username) {
            throw new Error("username is required when connecting to asus router via ssh");
        }
        if (!this.port) {
            throw new Error("port is required when connecting to asus router via ssh");           
        }
        if (!this.password && !this.privateKey && !this.privateKeyPath) {
            throw new Error("Either password, privateKey or privateKeyPath is required when connecting to asus router via ssh");              
        }
    }

    async connect() {
        return new NodeSSH().connect({
            host : this.host,
            username: this.username,
            password: this.password,
            port: this.port,
            privateKey: this.privateKey,
            privateKeyPath: this.privateKeyPath
        });
    }

    async getInterfaces(session) {
        let connectedMacs = await this.getConnectedMacs(session);
        let names = await this.getDeviceNames(session);
        let nickNames = await this.getDeviceNicknames(session);
        let wifiInterfaces = await Promise.all((await this.getWifiInterfaces(session)).map(i => this.getWifiInterfaceInfo(session, i)));

        let interfaces = [];

        for (let iface of wifiInterfaces) {
            var clients = iface.clients.filter(mac => connectedMacs.includes(mac)).map(mac => this.parseClient(mac, names, nickNames));
            var type;
            switch (iface.freq) {
                case '2.4':
                    type = iface.guest ? RouterInterfaceType.GUEST_WIFI_2_4G : RouterInterfaceType.WIFI_2_4G;
                    break;
                case '5':
                    type = iface.guest ? RouterInterfaceType.GUEST_WIFI_5G : RouterInterfaceType.WIFI_5G;
                    break;
            }

            interfaces.push(new RouterInterface(type, iface.isProtected, iface.ssid, clients));
        }

        let wiredClients = connectedMacs.filter(mac => !wifiInterfaces.flatMap(iface => iface.clients).includes(mac)).map(mac => this.parseClient(mac, names, nickNames));
        interfaces.push(new RouterInterface(RouterInterfaceType.WIRED, false, null, wiredClients));

        return interfaces.filter(i => i.clients.length > 0);
    }

    async disconnect(session) {
        session.dispose();
    }

    async getConnectedMacs(session) {
        let out = await this.execCommand(session, '/sbin/arp -n');
        return out.split("\n").map(line => /\(([0-9\.]+)\) at ([0-9a-f:]+).*on br0/.exec(line)).filter(match => !!match).map(match => match[2].toLowerCase());
    }

    async getDeviceNames(session) {
        let out = await this.execCommand(session, '/bin/cat /var/lib/misc/dnsmasq.leases');
        return out.split("\n").map(line => line.split(" ")).map(cols => ({'mac' : cols[1].toLowerCase(), 'name' : cols[3] == '*' ? null : cols[3]}));
    }

    async getWifiInterfaceInfo(session, iface) {
        let clientsOut = await this.execCommand(session, `/usr/sbin/wl -i ${iface} assoclist`);
        let statusOut = await this.execCommand(session, `/usr/sbin/wl -i ${iface} assoc`);
        let protectedOut = await this.execCommand(session, `/usr/sbin/wl -i ${iface} wpa_auth`);
        let clients = clientsOut.split("\n").map(line => /assoclist (.*)/.exec(line)).map(match => match[1].toLowerCase());
        let ssid = /SSID: "(.*)"/.exec(statusOut)[1];
        let freq = /Chanspec: (.*?)GHz/.exec(statusOut)[1];
        
        let isProtected = protectedOut != "0x0 Disabled";
        return {
            clients: clients,
            ssid: ssid,
            freq: freq,
            isProtected: isProtected,
            guest : iface.startsWith("wl")
        };
    }

    async getWifiInterfaces(session) {
        let ifnames = [0, 1].map(async i => {
            let primary = await this.execCommand(session, `/bin/nvram get wl${i}_ifname`);
            let guests = await this.execCommand(session, `/bin/nvram get wl${i}_vifs`);
            return [primary].concat(guests).filter(i => !!i);
        });
        return (await Promise.all(ifnames)).flatMap(i => i);
    }

    async getDeviceNicknames(session) {
        let out = await this.execCommand(session, '/bin/nvram get custom_clientlist');
        return out.split("<").map(line => /(.*?)>(.*?)>/.exec(line)).map(match => ({'name' : match[1], 'mac' : match[2].toLowerCase()}));
    }

    async execCommand(session, command) {
        let result = await session.execCommand(command);
        if (result.code != 0) {
            throw new Exception("Failed to execute command: " + command + ", stderr: " + result.stderr);
        }
        return result.stdout; 
    }

    parseClient(mac, names, nickNames) {
        let name = names.find(d => d.mac == mac);
        let nickname = nickNames.find(d => d.mac == mac);
        if (nickname) {
            return new RouterClient(mac, nickname.name.toLowerCase());
        }
        if (name) {
            return new RouterClient(mac, name.name.toLowerCase());
        }
        return new RouterClient(mac, null);
    }
}

/*
    Connects to the Asus Router via HTTP/HTTPS, no extra setup needed.
    This will force any logged in users to be logged out, so should have a pretty long timeout.
*/
class AsusWebRouterProvider extends RouterProvider {
    constructor(config) {
        super(config);
        this.username = config.username; 
        this.password = config.password;
        this.routerUrl = config.protocol + "://" + config.host;
        if (!this.username) {
            throw new Error("username is required when connecting to asus router via ssh");
        }
        if (!this.port) {
            throw new Error("port is required when connecting to asus router via ssh");           
        }
    }

    async connect() {
        let httpBasicAuth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        let formData = new URLSearchParams();
        formData.set("login_authorization", httpBasicAuth);

        let hostname = new URL(this.routerUrl).hostname;

        let response = await fetch(`${this.routerUrl}/login.cgi`, {
            method: 'POST',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Host' : hostname,
                'Referer' : `${this.routerUrl}/Main_Login.asp`
            },
            body: formData
        });

        if (response.status !== 200) {
            throw new Error(`Got error code: ${response.status}`);
        }

        //Extract cookies into an object
        let cookie = response.headers.getSetCookie().map(e => /([^=]+)=([^;]+)/.exec(e)).reduce((prev, curr) => { prev[curr[1]] = curr[2]; return prev}, {});

        if (!cookie.asus_token) {
            throw new Error("Missing asus_token in cookie response");
        }

        return cookie.asus_token;
    }

    async getInterfaces(session) {
        let token = session;
        let clients = (await this.getClientInfo(token)).filter(client => client.isOnline == '1');
        let interfaces = await this.getInterfaceInfo(token);

        return [
            this.parseInterface(RouterInterfaceType.WIFI_2_4G, clients, interfaces, '1', ''),
            this.parseInterface(RouterInterfaceType.WIFI_5G, clients, interfaces, '2', ''),
            this.parseInterface(RouterInterfaceType.GUEST_WIFI_2_4G, clients, interfaces, '1', '1'),
            this.parseInterface(RouterInterfaceType.GUEST_WIFI_5G, clients, interfaces, '2', '1'),
            this.parseInterface(RouterInterfaceType.WIRED, clients, interfaces, '0', '')
        ].filter(i => i.clients.length > 0);
    }

    async getClientInfo(token) {
        let response = await fetch(`${this.routerUrl}/appGet.cgi?hook=get_clientlist()`, {
            method: 'GET',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Referer' : `${this.routerUrl}/index.asp`,
                'Cookie' : `asus_token=${token}`
            }
        });
        
        if (response.status !== 200) {
            throw new Error(`Got error code: ${response.status}`);
        }

        let data = await response.json();

        return Object.values(data['get_clientlist']).filter(client => typeof client === 'object' && 'ip' in client);
    }

    async getInterfaceInfo(token) {
        let result = [
            { id : "0", isWL : "1", isGN : "" },
            { id : "1", isWL : "2", isGN : "" },
            { id : "0.1", isWL : "1", isGN : "1" },
            { id : "0.2", isWL : "1", isGN : "1" },
            { id : "0.3", isWL : "1", isGN : "1" },
            { id : "1.1", isWL : "2", isGN : "1" },
            { id : "1.2", isWL : "2", isGN : "1" },
            { id : "1.3", isWL : "2", isGN : "1" },
        ];
        let keys = Object.values(result).map(o => o.id).flatMap(id => [`wl${id}_ssid`, `wl${id}_auth_mode_x`, `wl${id}_bss_enabled`]);
        let hook = keys.map(key => `nvram_char_to_ascii(${key},${key})`).join("%3B");
        
        let response = await fetch(`${this.routerUrl}/appGet.cgi?hook=${hook}`, {
            method: 'GET',
            headers: {
                'Content-Type' : 'application/x-www-form-urlencoded',
                'Referer' : `${this.routerUrl}/index.asp`,
                'Cookie' : `asus_token=${token}`
            }
        });
        
        if (response.status !== 200) {
            throw new Error(`Got error code: ${response.status}`);
        }

        let data = await response.json();

        for (let i of result) {
            if (data[`wl${i.id}_bss_enabled`] == '1') {
                i['ssid'] = decodeURIComponent(data[`wl${i.id}_ssid`]);
                i['protected'] = data[`wl${i.id}_auth_mode_x`] != 'open';
            } else {
                i['id'] = null;
            }
        }

        return result.filter(i => !!i.id);
    }

    parseInterface(type, clients, interfaces, isWL, isGN) {
        let iface = interfaces.find(i => i.isWL == isWL && i.isGN == isGN);
        let ssid = iface ? iface.ssid : null;
        let isProtected = iface ? iface.protected : false;
        return new RouterInterface(type, isProtected, ssid, clients.filter(client => client.isWL == isWL && client.isGN == isGN).map(client => this.parseClient(client)));
    }

    parseClient(client) {
        var name = "";
        if (client.name && client.nickName) {
            name = client.name.length > client.nickName.length ? client.nickName : client.name;
        } else if (client.name) {
            name = client.name;
        } else if (client.nickName) {
            name = client.nickName;
        }
        return new RouterClient(client.mac, name.toLowerCase());
    }
}

export default AsusDelegatingRouterProvider;
