const express = require('express');
const { v4: uuidv4 } = require('uuid');
const VehicleCommands = require("../Proto/vehicle-commands_pb");
const Client = require("../Proto/client_pb");
const { CarStatesByVin, dropAndReconnect,ws,sendcommand} = require('./socket');
const { refreshToken, readAndDecodeJSONFile, saveJSONFile, Headers,getAuthInfo,generateUUID ,DeviceID,SessionId,LoadConfig} = require('./auth');
const request = require('request');
const router = express.Router();
const Pin = process.env.CarPin;
const globalEvents = require('./globalEvents');
const {carConfigMaps,commandToCarParameterMap} = require('./carConfigMaps');
const axios = require('axios');
router.get('/Car/:CarID/listStates', (req, res) => {
  const keys = Object.keys(CarStatesByVin[req.params.CarID]);
  res.json(keys);
});

router.get('/Car/:CarID/All', (req, res) => {
  res.json(CarStatesByVin[req.params.CarID]);
});

router.get('/Car/:CarID/:state', (req, res) => {
  const state = CarStatesByVin[req.params.CarID][req.params.state];
  if (state === undefined) {
    res.send("undefined");
  } else {
    res.json(state);
  }
});

router.post('/Car/:CarID/:command/:second?', (req, res) => {
  const CommandID = uuidv4();
  const command = new VehicleCommands.CommandRequest();
  command.setBackend(1);
  command.setVin(req.params.CarID);
  command.setRequestId(CommandID);
  const Action = req.params.command;
  const vc = new VehicleCommands[Action]();
  if (vc.setPin) {
    vc.setPin(Pin);
  }
  command["set" + Action](vc);

  const clientMessage = new Client.ClientMessage();
  clientMessage.setCommandrequest(command);
  // ws.send(clientMessage.serializeBinary());
  sendcommand(clientMessage.serializeBinary());
  res.send({});
});

router.get('/kill', (req, res) => {
  res.send("Killing the server");
  res.end();
  process.exit(1);
});

router.post('/Carproto/:base64', (req, res) => {
  const clientMessage = Buffer.from(req.params.base64, 'base64');
  // ws.send(clientMessage);
  sendcommand(clientMessage);
  res.send("Sent");
  res.end();
});

router.get('/token', (req, res) => {
  const jsonData = getAuthInfo();
  if (jsonData["expires_at"] + 5000 < Date.now()) {
    refreshToken();
    setTimeout(() => {
      const jsonData = getAuthInfo();
      res.send(jsonData);
      res.end();
    });
  } else {
    res.send(jsonData);
    res.end();
  }
});

router.post('/Login/:username', (req, res) => {


   LoadConfig();

  
  let username = req.params.username;
  console.log(username);
//   res.send(JSON.stringify({ "emailOrPhoneNumber": username, "nonce": "t", "countryCode": "US" }));
//   res.end();
  let data = JSON.stringify({
    "emailOrPhoneNumber": username,
    "countryCode": "US",
    "nonce": "t"
  });
  
  let config = {
    method: 'post',
    url: 'https://bff.emea-prod.mobilesdk.mercedes-benz.com/v1/login',
    headers: { 
      'Host': 'bff.emea-prod.mobilesdk.mercedes-benz.com', 
      'ris-os-version': '18.1', 
      'X-TrackingId': generateUUID(), 
      'ris-os-name': 'ios', 
      'X-SessionId':  SessionId, 
      'Accept': '*/*', 
      'X-ApplicationName': 'mycar-store-ece', 
      'Accept-Language': 'en-US;q=1.0', 
      'ris-sdk-version': '2.122.0', 
      'User-Agent': 'MyCar/1.46.0 (com.daimler.ris.mercedesme.ece.ios; build:2409; iOS 18.1.0) Alamofire/5.9.1', 
      'ris-application-version': '1.46.0 (2409)', 
      'Connection': 'keep-alive', 
      'X-Locale': 'en-US', 
      'Content-Type': 'application/json'
    },
    data : data
  };
  
  axios.request(config)
  .then((response) => {
    console.log(response);
    res.send(response.data);
    res.end();
  })
  .catch((error) => {
    console.log(error);
    res.end();
  });

  
});

router.post('/Login_Code/:username/:code', (req, res) => {
  var RequestCode = req.params.code;
  var username = req.params.username;
  var trackingID = req.params.trackingID;

  let data = `client_id=01398c1c-dc45-4b42-882b-9f5ba9f175f1&grant_type=password&password=t%3A${RequestCode}&scope=openid%20email%20phone%20profile%20offline_access%20ciam-uid&username=${username}`;

let config = {
  method: 'post',
  url: 'https://id.mercedes-benz.com/as/token.oauth2',
  headers: { 
    'Host': 'id.mercedes-benz.com', 
    'X-SessionId': SessionId, 
    'User-Agent': 'MyCar/1.46.0 (com.daimler.ris.mercedesme.ece.ios; build:2409; iOS 18.1.0) Alamofire/5.9.1', 
    'device-uuid': DeviceID, 
    'RIS-OS-Version': '18.1', 
    'ris-application-version': '1.46.0 (2409)', 
    'X-Device-Id': DeviceID, 
    'X-TrackingId':generateUUID(), 
    'Stage': 'prod', 
    'RIS-SDK-Version': '2.122.0', 
    'Connection': 'keep-alive', 
    'X-ApplicationName': 'mycar-store-ece', 
    'RIS-OS-Name': 'ios', 
    'X-Locale': 'en-US', 
    'Accept-Language': 'en-US;q=1.0', 
    'X-Request-Id': generateUUID(), 
    'Accept': '*/*', 
    'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
  },
  data : data
};

axios.request(config)
.then((response) => {
  // check the header code 
  console.log(response ? response.status : "No response");
  console.log(response ? response.data : "No response");
  if ((response && response.status >= 400)) {
    console.log("Error on login");
    console.log(response);
  } else {
    try {
      const token = response.data;
      token["expires_at"] = Date.now() + token["expires_in"] * 1000;
      saveJSONFile(token);
      AuthInfo = token;
      dropAndReconnect();
    } catch (error) {
      console.log(error);
    }
  }
  res.send(response.body);
  res.end();
})
.catch((error) => {
  console.log(error);
  res.send("no");
  res.end();
});

});

router.get('/drop', (req, res) => {
  dropAndReconnect();
  res.send("Dropped");
  res.end();
});


router.post('/CarV2/:CarID', (req, res) => {
  const CommandID = uuidv4();
  const command = new VehicleCommands.CommandRequest();
  command.setBackend(1);
  command.setVin(req.params.CarID);
  command.setRequestId(CommandID);
  const Action = req.body.command;
  const vc = new VehicleCommands[Action]();
  if (vc.setPin) {
    vc.setPin(Pin);
  }
  command["set" + Action](vc);

  const responsekey = commandToCarParameterMap[Action] ?? "";
  const clientMessage = new Client.ClientMessage();
  clientMessage.setCommandrequest(command);
  sendcommand(clientMessage.serializeBinary());
  globalEvents.on('carStateChange' + req.params.CarID, (key, value) => {
    if (key === responsekey || responsekey === "") {
      const formattedValue = carConfigMaps[responsekey] ? value[carConfigMaps[responsekey]] : value;
      const reply = { "key": key};
      reply[req.body.command] = formattedValue;
      res.send(reply);
      globalEvents.removeAllListeners('carStateChange' + req.params.CarID);
    }
  });
});




module.exports = router;
