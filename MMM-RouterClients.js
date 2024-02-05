//Can't import normally since this is not a module...
var RouterInterfaceType;
(async () => {
	RouterInterfaceType = await (await import("./routerprovider.mjs")).RouterInterfaceType;
})();

Module.register("MMM-RouterClients",{
	defaults: {
		showClientNames: true,
		showInterfaceName: true,
		showProtected: true,
		showSSID: true,
		alertNewClients: true,
		newDuration: 1000 * 60 * 60 * 24, // One full day
		updateInterval: 1000 * 60 * 60, // Every hour 
		persistData: false,
		provider: null,
		host: null,
		port: null,
		protocol: null,
		username: null,
		password: null,
		privateKey: null,
		privateKeyPath: null
	},

	start: function() {
		let self = this;
		self.interfaces = [];
		self.sendSocketNotification("GET_ROUTER_DATA", self.config);
		setInterval(() => {
			self.sendSocketNotification("GET_ROUTER_DATA", self.config);
		}, self.config.updateInterval);
	},

	getTemplate: function () {
		return "MMM-RouterClients.njk";
	},

	getStyles: function () {
		return ["MMM-RouterClients.css", "font-awesome.css"];
	},

	getTemplateData: function () {
		let self = this;
		return {
			config: self.config,
			interfaces: self.interfaces
		}
	},

	getTranslations: function() {
		return {
				sv: "translations/sv.json",
				en: "translations/en.json"
		};
	},

	socketNotificationReceived: function (notification, payload) {
		let self = this;
		if (notification == "ROUTER_DATA") {
			self.interfaces = self.transformInterfaces(payload.interfaces);
			if (self.config.alertNewClients) {
				let newClients = self.newClients(self.interfaces);
				self.alertNewClients(newClients);
			}
			self.updateDom();
		} else if (notification == "ROUTER_DATA_ERROR") {
			this.sendNotification("SHOW_ALERT", { 
				title : this.name + ": " + self.translate("ROUTER_DATA_ERROR"),
				message : payload,
				timer: self.config.updateInterval
			});			
		}
	},

	transformInterfaces: function(interfaces) {
		let self = this;
		return interfaces.map(interface => self.transformInterface(interface));
	},
	
	transformInterface: function(interface) {
		let self = this;
		let result = {protected: interface.protected, clients: self.transformClients(interface.clients), ssid: interface.ssid};
		switch (interface.type) {
			case RouterInterfaceType.WIFI_2_4G:
				return Object.assign(result, {
					"icon" : "fa-wifi",
					"iconSub" : "2.4G",
					"name" : self.translate("WIFI_2.4G")
				});
			case RouterInterfaceType.WIFI_5G:
				return Object.assign(result, {
					"icon" : "fa-wifi",
					"iconSub" : "5G",
					"name" : self.translate("WIFI_5G")
				});
			case RouterInterfaceType.GUEST_WIFI_2_4G:
				return Object.assign(result, {
					"icon" : "fa-wifi",
					"iconSub" : "2.4G",
					"name" : self.translate("GUEST_WIFI_2.4G")
				});
			case RouterInterfaceType.GUEST_WIFI_5G:
				return Object.assign(result, {
					"icon" : "fa-wifi",
					"iconSub" : "5G",
					"name" : self.translate("GUEST_WIFI_5G")
				});
			case RouterInterfaceType.WIRED:
				return Object.assign(result, {
					"icon" : "fa-ethernet",
					"name" : self.translate("WIRED")
				});
			default:
				return result;
		}
	},

	transformClients: function(clients) {
		let self = this;
		return clients.map(client => self.transformClient(client));		
	},

	transformClient: function(client) {
		let self = this;
		let name = client.name ? client.name : self.translate("NO_CLIENT_NAME");
		return {
			name : name,
			new : client.new
		}		
	},

	alertNewClients: function(newClients) {
		let self = this;
		this.sendNotification("SHOW_ALERT", { 
			title : this.name + ": " + self.translate("NEW_CLIENTS_TITLE"),
			message : newClients.join(", "),
			timer: self.config.newDuration
		});
	},

	newClients: function(interfaces) {
		return interfaces.flatMap(interface => interface.clients).filter(client => client.new).map(client => client.name);
	}
});
