# MMM-RouterClients
[Magic Mirror](https://magicmirror.builders/) Module - A module for Magic Mirror that displays the connected clients to your router.

![Screenshot][screenshot]

## Install
1. Clone repository into ``../modules/`` inside your MagicMirror folder.
2. Run ``npm install`` inside the ``MMM-RouterClients`` folder.
3. Add the module to the Magic Mirror config.
```
{
  module: "MMM-RouterClients",
  position: "top_left",
  header: "Devices in the network",
  config: {
    provider: "asus",
    protocol: "http",
    username: "<username to login to router>",
    password: "<password to login to router>"
  }
}
```
4. Done!

## Configuration parameters
- ``showClientNames`` : If the name of the clients should be displayed or just a count, defaults to true
- ``showInterfaceName`` : If the name of the interface should be displayed, defaults to true
- ``showProtected`` : If an icon should be displayed to indicate if the network requires authentication, defaults to true
- ``showSSID`` : If the SSID for the wireless networks should be displayed, defaults to true
- ``alertNewClients`` : If new clients should result in a notification to the alert-module, defaults to true 
- ``newDuration`` : How long should a device be treated as new in milliseconds, defaults to a full day
- ``updateInterval`` : How often should the data be refreshed from the router in milliseconds, defaults to an hour
- ``persistData`` : If the data should be saved to a file, otherwise a restart of the mirror will treat all devices as new, defaults to false
- ``provider`` : Which provider should be used, see possible providers below, ***required***

## Asus Provider
The only provider for now, can connect via HTTP/HTTPS or via SSH.

HTTP is easier to setup (uses your standard username & password), but it logs you out from the web UI when it refreshes!

Only tested on a TUF-AX5400 with latest stock firmware for now.

### Asus configuration parameters
- ``host`` : Where to connect to, probably should be www.asusrouter.com, ***required***
- ``port`` : Which port to connect to, probably should be 80 if using HTTP. ***required***
- ``protocol`` : Should be any of these values: http, https, ssh. ***required***
- ``username`` : The username to login with, ***required***
- ``password`` : The password to login with, required if using HTTP/HTTPS, but optional for SSH
- ``privateKey`` : If private key authentication should be used for SSH, the value of the key, optional
- ``privateKeyPath`` : If private key authentication should be used for SSH, the path to the file that has the key, optional

 [screenshot]: https://github.com/buxxi/MMM-RouterClients/blob/master/screenshot.png