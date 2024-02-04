const NodeHelper = require("node_helper");
const Log = require("logger");
const fs = require("fs/promises");
const path = require("path");

const DATA_FILE = path.resolve(__dirname, "data", "seen.json");

module.exports = NodeHelper.create({
	firstSeen: {},

	start: async function() {
		let self = this;
		try {
			self.firstSeen = JSON.parse(await fs.readFile(DATA_FILE));
		} catch (e) {
			Log.warn(`Could not read: ${DATA_FILE}: ${e}`);
		}
	},
	
	socketNotificationReceived: async function(notification, payload) {
		let self = this;
		if (notification == "GET_ROUTER_DATA") {
			try {
				let provider = await self.getProvider(payload);
				var data;
				var session;
				try {
					session = await provider.connect();
					data = await provider.getInterfaces(session);
				} finally {
					await provider.disconnect(session);
				}

				self.sendResult(self.transformData(data, payload));
				await self.updateSeen(data, payload);
			} catch (e) {
				Log.error(e);
				self.sendSocketNotification("ROUTER_DATA_ERROR", e.toString());
			}
		}
	},

	sendResult: function(data) {
		let self = this;

		self.sendSocketNotification("ROUTER_DATA", {
			interfaces: data
		});
	},

	getProvider: async function(config) {
		try {
			let providerFile = `./routerproviders/${config.provider}.mjs`;
			let providerClass = await import(providerFile);
			return new providerClass.default(config);
		} catch (e) {
			throw new Error(`Could not load provider ${config.provider}: ${e}`);
		}
	},

	transformData: function(interfaces, config) {
		let self = this;
		return interfaces.map(interface => self.transformInterface(interface, config));
	},

	transformInterface: function(interface, config) {
		let self = this;
		let clients = interface.clients.map(client => self.transformClient(client, config));
		return {'type' : interface.type, 'protected': interface.isProtected, 'ssid': interface.ssid, clients };
	},

	transformClient: function(client, config) {
		let self = this;
		return {'name' : client.name, 'new' : self.isNewClient(client.macAddress, config) };
	},

	isNewClient: function(macAddress, config) {
		let self = this;

		if (!(macAddress in self.firstSeen)) {
			return true;
		}
		
		let diff = Date.now() - self.firstSeen[macAddress];
		return diff < config.newDuration;
	},
	
	async updateSeen(data, config) {
		let self = this;
		
		let macs = data.flatMap(i => i.clients).map(c => c.macAddress);
		for (let mac of macs) {
			if (!(mac in self.firstSeen)) {
				self.firstSeen[mac] = Date.now();
			}
		}

		if (!config.persistData) {
			return;
		}

		await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
		await fs.writeFile(DATA_FILE, JSON.stringify(self.firstSeen));
	}
});
