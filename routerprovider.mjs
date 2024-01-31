/**
 * Extend this class for each router implementation
 */
class RouterProvider {
    constructor(config) {}
    /**
     * @returns A Promise that returns the open connection needed to make the actual lookups or rejected if the login fails
     */
     async connect() {
        return [];
    }

    /**
     * @returns A Promise with lists of RouterInterface's from the router or rejected with an error
     */
    async getInterfaces(session) {
        return [];
    }

    /**
     * Cleans up what is needed and closes the connection
     */
    async disconnect(session) {

    }
}

class RouterInterface {
    constructor(type, isProtected, ssid, clients) {
        this.type = type;
        this.isProtected = isProtected;
        this.ssid = ssid;
        this.clients = clients;
    }
}

class RouterClient {
    constructor(macAddress, name) {
        this.macAddress = macAddress;
        this.name = name;
    }
}

const RouterInterfaceType = {
    WIFI_2_4G : "WIFI_2_4G",
    WIFI_5G : "WIFI_5G",
    GUEST_WIFI_2_4G : "GUEST_WIFI_2_4G",
    GUEST_WIFI_5G : "GUEST_WIFI_5G",
    WIRED : "WIRED"
}

export { 
    RouterProvider,
    RouterInterface,
    RouterClient,
    RouterInterfaceType
};