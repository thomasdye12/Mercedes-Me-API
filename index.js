const request = require("request");
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const VehicleCommands = require("./Proto/vehicle-commands_pb");
const VehicleEvents = require("./Proto/vehicle-events_pb");
const Client = require("./Proto/client_pb");
const fs = require('fs');
const express = require('express');
const schedule = require('node-schedule');
const { Console } = require("console");
const app = express();
const port = 5007;
const Pin = process.env.CarPin;
// Generate a unique UUID for each connection
const generateUUID = () => uuidv4();
const AuthFile = "auth.json";
let timerId;
let ws;

var StateChangedBasedonRequestByVin = {};
var CarStatesByVin = {};
let CarStatusTimes = {};
var AuthInfo
var LoginInfo = {};
var PostURL = "http://127.0.0.1/app/mercedes/UpdateDeviceDateV2.php";
const jsonData = readAndDecodeJSONFile();
AuthInfo = jsonData;
// Authtoken = jsonData["access_token"] ?? "";
// RefreshToken = jsonData["refresh_token"];

console.log(AuthInfo["access_token"]);
// console.log(RefreshToken);
refreshToken();



function connectWebSocket() {

  var trackingID = generateUUID();
var connectionOptions = {
  headers: Headers(),
};

//  add the authentification to the header of the websocket
connectionOptions.headers["Authorization"] =  AuthInfo["access_token"];
var SessionKeepAlive = setInterval(() => {
  console.log("Sending keep alive");
  ws.send("keep alive");
}, 6600);


  ws = new WebSocket('wss://websocket.emea-prod.mobilesdk.mercedes-benz.com/v2/ws', connectionOptions);

  // Event: WebSocket connection is established
  ws.on('open', () => {
    // startTimer();
    // log the current time
    console.log(Date.now());
    console.log('Connected to the WebSocket server');

    // Send a message to the server
    // ws.send('Hello, server!');
  });

  // Event: Received a message from the WebSocket server
  ws.on('message', (data, isBinary) => {
    // Process the received message
    processData(data, isBinary);

    console.log("\n\n");
    // base64 encoded string add 2 new lines above and blow wehn console log
    // const base64 = data.toString('base64');
    // console.log('Received a message from the server:', base64);
    // console.log("\n\n");
  });

  // Event: WebSocket connection closed
  ws.on('close', (code, reason) => {
    // conver the reason to a string from a buffer
    reason = reason.toString();
    console.log(Date.now());
    console.log('Connection closed:', code, reason);
    refreshToken();
    setTimeout(() => {
      reconnectWebSocket();
    }, 5000);
  });

  // Event: WebSocket connection encounters an error
  ws.on('error', (error) => {
    console.log(Date.now());
    console.error('WebSocket error:', error);
    console.error(error.message);
    console.error(error.code);
    // if error is 403 then refresh the token, wait 5 seconds then reconnect
    if (error.message == "Unexpected server response: 403") {
      console.error("403 error");
      refreshToken();
      setTimeout(() => {
        reconnectWebSocket();
      }, 5000);
    } else {
      reconnectWebSocket();
    }
  });
  ws.on('open', function open() {
    console.log(Date.now());
    console.log('connected');
    // ws.send(Date.now());
  });




}

// drop and reconnect
function dropAndReconnect() {
  console.log('Dropping WebSocket connection...');

  ws.removeAllListeners(); // Remove all existing event listeners
  refreshToken();
  // Reconnect after a delay (e.g., 5 seconds)
  setTimeout(() => {
    connectWebSocket();
  }, 9000);
}



function processData(data, isBinary) {
  // Convert data based on type
  data = isBinary ? data : data.toString();

  try {
    const message = VehicleEvents.PushMessage.deserializeBinary(data).toObject();
    handleReceivedMessage(message);
  } catch (error) {
    console.error("Websocket parse error", error);
    // Optional: Close and reconnect websocket, handle error as needed
    // handleWebSocketError(ws);
  }
}

function handleReceivedMessage(message) {
  if (message.debugmessage) {
    logDebugMessage(message.debugmessage);
  } else if (message.apptwinCommandStatusUpdatesByVin) {
    handleAppTwinUpdates(message.apptwinCommandStatusUpdatesByVin);
  } else if (message.assignedVehicles) {
    handleAssignedVehicles(message.assignedVehicles);
  } else if (message.apptwinPendingCommandRequest) {
    console.log("apptwinPendingCommandRequest:", JSON.stringify(message.apptwinPendingCommandRequest));
  } else if (message.vepupdates) {
    handleVepUpdates(message.vepupdates);
  } else {
    console.log("Received unknown message", JSON.stringify(message));
  }
}

function logDebugMessage(debugMessage) {
  console.log(JSON.stringify(debugMessage));
}

function handleAppTwinUpdates(updates) {
  console.log(JSON.stringify(updates));
  acknowledgeUpdates(updates, 'AppTwinCommandStatusUpdatesByVIN');
  // Additional logic specific to AppTwin updates...
}

function handleAssignedVehicles(vehicles) {
  console.log(JSON.stringify(vehicles));
  acknowledgeUpdates(vehicles, 'AssignedVehicles');
  // Additional logic for handling assigned vehicles...
}

function acknowledgeUpdates(updates, type) {
  const ackCommand = new Client['Acknowledge' + type]();
  const clientMessage = new Client.ClientMessage();
  clientMessage['setAcknowledge' + type](ackCommand);
  ws.send(clientMessage.serializeBinary());
}

function handleVepUpdates(vepupdates) {
  if (!Array.isArray(vepupdates.updatesMap)) {
    console.log('rawData is not an array');
    return;
  }
  updateCarStatesByVin(vepupdates.updatesMap);
}



function updateCarStatesByVin(rawData) {
  // console.log(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    if (typeof rawData[i][0] === 'string') {
      // If this VIN is not in CarStatesByVin, create an empty attributes object for it.
      if (!CarStatesByVin[rawData[i][0]]) {
        CarStatesByVin[rawData[i][0]] = {};
      }
      rawData[i][1].attributesMap.forEach(([key, value]) => {
        $oldValue = {};
        // get the old value if it exists
        if (CarStatesByVin[rawData[i][0]][key]) {
          $oldValue = CarStatesByVin[rawData[i][0]][key];
        }
        // This line either updates an existing attribute or adds a new one.
        CarStatesByVin[rawData[i][0]][key] = value;
        PostChanges(rawData[i][0], key, value, $oldValue);
      });
    }
  }

}


function PostChanges(CarID, Key, Value, OldValue) {
  $IgnoreKeys = ["vtime", "vehicleDataConnectionState"];
  // check if the key is in the ignore list
  if ($IgnoreKeys.includes(Key)) {
    return;
  }
  // compair the values other then the timestamp,timestampInMs,changed  to check if a change has been made
  if (!CarValueChanged(OldValue, Value)) {
    // no change has been made
    return;
  }



  manageCarStatus(CarID, Key, Value);


  ValueChangedForCarState = true;
  // make post request with the state
  console.log(`${CarID}: ${Key}: ${Value["changed"]}`);
  // make post request
  // create json 
  SendPost(CarID, Key, Value);
}

function SendPost(CarID, Key, Value) {
  var json = {};
  json["carid"] = CarID;
  json["state"] = Key;
  json["value"] = Value;
  //  console.log(JSON.stringify(json));
  //  console.log(json);
  // make post request
  request.post(
    {
      gzip: true,
      url: PostURL,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(json),
    },
    (err, resp, body) => {
    });

}
// function to check for change in the car value 

function CarValueChanged(oldValue, newValue) {



  // check if the old value is blank
  if (oldValue == {}) {
    return true;
  }
  // check if the new value is blank
  if (newValue == {}) {
    return true;
  }
  // only contunue if the changed value is true
  if (newValue["changed"] == false) {
    return false;
  }

  $keysToIgnore = ["timestamp", "timestampInMs", "changed", "serviceIdsList"];

  for (const key in newValue) {
    // if the key is in the ignore list then skip it
    if ($keysToIgnore.includes(key)) {
      continue;
    }

    // check if the key is in the old value
    if (key in oldValue) {
      if (oldValue[key] != newValue[key]) {
        console.log("value changed");
        console.log(key);
        return true;
      }
    } else {
      // the key is not in the old value
      return false;
    }
  }

}




function refreshToken() {
  console.log("refresh token");
  var headers = Headers();
  headers["Content-Type"] = "application/x-www-form-urlencoded";

  request.post(
    {
      gzip: true,
      url: "https://id.mercedes-benz.com/as/token.oauth2",
      headers: headers,
      followAllRedirects: false,
      body: "grant_type=refresh_token&refresh_token=" + AuthInfo["refresh_token"],
    },
    (err, resp, body) => {
      if (err || (resp && resp.statusCode >= 400) || !body) {
        console.log("Error refresh token");
        console.log(err);
        console.log(resp);
      }
      try {
        const token = JSON.parse(body);
        console.log(token);
        // work out when the token will expire
        token.expires_at = Date.now() + token.expires_in * 1000;

        console.log(token);
        // save the tokens to the auth file
        saveJSONFile(token);
        AuthInfo = token;


      } catch (error) {
        console.log(error);
      }
    },
  );
};

function readAndDecodeJSONFile() {
  try {
    const data = fs.readFileSync(AuthFile, 'utf8');
    const jsonData = JSON.parse(data);
    return jsonData;
  } catch (error) {
    console.log(error);
    return null; // or throw an exception if you want to handle errors differently
  }
}


// make a function to save the json file
function saveJSONFile(data) {

  fs.writeFile(AuthFile, JSON.stringify(data), function (err) {
    if (err) return console.log(err);
    console.log(JSON.stringify(data));
    console.log('writing to ' + AuthFile);
  });
}

// want some code to work out for all cars if they have been unlocked for 5 mins 

function manageCarStatus(CarID, Key, Value) {
  if (CarStatusTimes[CarID]) {

  } else {
    CarStatusTimes[CarID] = {};
  }




  if (Key == "vehicleLockState") {
    if (CarStatusTimes[CarID][Key]) {
      // cancel timer 
      CarStatusTimes[CarID][Key].cancel();
      console.log("Cancelling timer for car " + CarID);
    }
    // set timer

    if (Value["intValue"] == 0 || Value["intValue"] == 3) {
      // console.log("Starting timer for car " + CarID + " for 5 minutes");
      let date = new Date(); // now
      date.setMinutes(date.getMinutes() + 15); // add 5 minutes to now
      console.log("Starting timer for car " + CarID + " for 15 minutes");
      CarStatusTimes[CarID][Key] = schedule.scheduleJob(date, function () {
        console.log(`Car ${CarID} has been unlocked for 15 minutes`);
        SendPost(CarID, "vehicleLockStateUnlockedFor5Minutes", "15");
      });
    }
  } else if (Key == "ignitionstate") {
    if (CarStatusTimes[CarID]["vehicleLockState"]) {
      // cancel timer 
      CarStatusTimes[CarID]["vehicleLockState"].cancel();
      console.log("Cancelling timer for car " + CarID);
    }
    // set timer

    if (Value["intValue"] == 0) {
      // console.log("Starting timer for car " + CarID + " for 15 minutes");
      let date = new Date(); // now
      date.setMinutes(date.getMinutes() + 15); // add 5 minutes to now
      console.log("Starting timer for car " + CarID + " for 15 minutes");
      CarStatusTimes[CarID]["vehicleLockState"] = schedule.scheduleJob(date, function () {
        console.log(`Car ${CarID} has been unlocked for 5 minutes`);
        SendPost(CarID, "vehicleLockStateUnlockedFor5Minutes", "15");
      });
    }


  }


}







//  web end Point
app.get('/Car/:CarID/listStates', (req, res) => {
  // list all the states from the car service from the carid
  // console.log(req.params);
  console.log(req.params.CarID);
  // console.log(req.params.listStates);
  console.log(CarStatesByVin[req.params.CarID]);
  // flatten to just the keys
  var keys = Object.keys(CarStatesByVin[req.params.CarID]);
  console.log(keys);
  // convert to json
  res.json(keys);


});

//  web end Point
app.get('/Car/:CarID/All', (req, res) => {
  // list all the states from the car service from the carid
  // console.log(req.params);
  // console.log(req.params.CarID);
  // // console.log(req.params.listStates);
  // console.log(CarStatesByVin[req.params.CarID]);
  // convert to json
  res.json(CarStatesByVin[req.params.CarID]);


});
app.get('/Car/:CarID/:state', (req, res) => {
  // get the car service from the carid and the state from the CarStatesByVin object
  // console.log(req.params);
  // console.log(req.params.CarID);
  // console.log(req.params.state);
  // console.log(CarStatesByVin[req.params.CarID][req.params.state]);
  // res.send(CarStatesByVin[req.params.CarID][req.params.state]);
  // check if its undefined
  if (CarStatesByVin[req.params.CarID][req.params.state] === undefined) {
    res.send("undefined");
  }
  else {
    // res.send(CarStatesByVin[req.params.CarID][req.params.state]);
    res.json(CarStatesByVin[req.params.CarID][req.params.state]);
  }

});



// handle post request to send commands to the car
app.post('/Car/:CarID/:command/:second?', (req, res) => {
  const CommandID = uuidv4()
  const command = new VehicleCommands.CommandRequest();
  command.setBackend(1);
  command.setVin(req.params.CarID);
  command.setRequestId(CommandID);
  StateChangedBasedonRequestByVin[req.params.CarID] = { "vin": req.params.CarID, "requestId": CommandID, "command": req.params.command, "second": req.params.second };
  const Action = req.params.command;
  const vc = new VehicleCommands[Action]();
  console.log(vc);
  if (vc.setPin) {
    vc.setPin(Pin);
  }

  if (ws.readyState == 3) {
    // dropAndReconnect();
  }






  command["set" + Action](vc);

  console.log(JSON.stringify(command.toObject()));
  console.log(command);


  const clientMessage = new Client.ClientMessage();

  clientMessage.setCommandrequest(command);
  // clientMessage.setTrackingId(this.xTracking);
  // this.log.debug(JSON.stringify(clientMessage.toObject()));
  console.log(JSON.stringify(clientMessage.toObject()));
  ValueChangedForCarState = false;
  ws.send(clientMessage.serializeBinary());
  try {
    waitForValueChange(req.params.CarID).then(() => {
      console.log("Value changed");
      res.send(StateChangedBasedonRequestByVin[req.params.CarID]["Response"]);
      res.end();
    }).catch(() => {
      console.log("Value did not change");
      // res.code(204);
      res.send({});
      res.end();
    });
  }
  catch (error) {
    console.log(error);
    // res.code(204);
    res.send({});
    res.end();
  }


});

function waitForValueChange(carID) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearTimeout(timeout);
      reject(new Error('Value did not change within the specified time limit.'));
    }, 10000); // Set the maximum wait time to 10 seconds (10000 milliseconds)

    const checkValue = () => {
      if (StateChangedBasedonRequestByVin[carID]["Response"] == undefined) {
        setTimeout(checkValue, 100); // Check the value every 100 milliseconds
      } else {
        clearTimeout(timeout);
        resolve();
      }
    };

    checkValue();
  });
}


app.get('/kill', (req, res) => {
  // kill the server
  res.send("Killing the server");
  res.end();
  process.exit(1);
});


app.post('/Carproto/:base64', (req, res) => {
  // take the base 64 data and convert it to binary and send it to the car
  console.log(req.params.base64);
  // console.log(req.params.base64.length);
  // console.log(Buffer.from(req.params.base64, 'base64'));
  const clientMessage = Buffer.from(req.params.base64, 'base64');
  ws.send(clientMessage);
  res.send("Sent");
  res.end();
});



// Start the WebSocket connection
connectWebSocket();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});



// get jwt token api end point
app.get('/token', (req, res) => {
  // check when the token expires
  // if its expired then get a new one
  // if its not expired then return the token
  // console.log(req.params);
  // get token from file 
  const jsonData = readAndDecodeJSONFile();

  if (jsonData["expires_at"] + 5000 < Date.now()) {
    refreshToken();

    setTimeout(() => {
      // read the file again
      const jsonData = readAndDecodeJSONFile();
      // return the token
      res.send(jsonData);
      res.end();
    });
  } else {
    // return the token
    res.send(jsonData);
    res.end();
  }
});

//  update login info
app.post('/Login/:username', (req, res) => {
  let username = req.params.username;
  var randomUUID = generateUUID();
  var options = {
    'method': 'POST',
    'url': 'https://bff.emea-prod.mobilesdk.mercedes-benz.com/v1/login',
    'headers': Headers(),
    body: JSON.stringify({
      "emailOrPhoneNumber": username,
      "nonce": "t",
      "countryCode": "US"
    })

  };
  request(options, function (error, response) {
    res.send(response.body);
    console.log(response.body);
    res.end();
  });

});


app.post('/Login_Code/:username/:code', (req, res) => {
  var RequestCode = req.params.code;
  var username = req.params.username;
  var randomUUID = generateUUID();
  var options = {
    'method': 'POST',
    'url': 'https://id.mercedes-benz.com/as/token.oauth2',
    'headers': Headers(),
    body: 'client_id=01398c1c-dc45-4b42-882b-9f5ba9f175f1&grant_type=password&password=t%3A' + RequestCode + '&scope=openid%20email%20phone%20profile%20offline_access%20ciam-uid&username=' + username

  };
  request(options, function (error, response) {
    if (error || (response && response.statusCode >= 400) || !response.body) {
      console.log("Error on login");
      console.log(error);
      console.log(response);
    } else {
      try {
        const token = JSON.parse(response.body);
        console.log(token);
        // work out when the token will expire
        token.expires_at = Date.now() + token.expires_in * 1000;

        console.log(token);
        // save the tokens to the auth file
        saveJSONFile(token);
        AuthInfo = token;
        // reload the web socket
        dropAndReconnect();
      } catch (error) {
        console.log(error);
      }
    }

    console.log(response.body);
    res.send(response.body);
    res.end();
  });

});
app.get('/drop', (req, res) => {
  // drop the websocket connection
  dropAndReconnect();
  res.send("Dropped");
  res.end();
}
);

function  Headers() {
//   X-Sessionid:{{$guid}}
// Ris-Os-Name:ios
// Ris-Os-Version:17.4.1
// Ris-Sdk-Version:2.114.0
// X-Locale:en-GB
// X-Trackingid:{{$guid}}
// User-Agent:MyCar/2168 CFNetwork/1494.0.7 Darwin/23.4.0
// Content-Type:application/json
// Accept-Language:en-GB
// X-Applicationname:mycar-store-ece
// Ris-Application-Version:1.42.0 (2168)
const TrackingId = generateUUID();
const SessionId = generateUUID();

const headers = {
  'Host': 'id.mercedes-benz.com',
  'ris-os-version': '17.4.1',
  'X-TrackingId':TrackingId,
  'ris-os-name': 'ios',
  'X-SessionId': SessionId,
  'Accept': '*/*',
  'X-ApplicationName': 'mycar-store-ece',
  'Accept-Language': 'en-GB;q=1.0, fr-FR;q=0.9',
  'ris-sdk-version': '2.107.0',
  'User-Agent': 'MyCar/1.38.0 (com.daimler.ris.mercedesme.ece.ios; build:2035; iOS 17.2.0) Alamofire/5.4.0',
  'ris-application-version': '1.38.0 (2035)',
  'Connection': 'keep-alive',
  'X-Locale': 'en-US',
  'Content-Type': 'application/json',
  "Stage": "prod",
  "X-Device-Id" :generateUUID(),
  "X-Request-Id": generateUUID(),
};
return headers;
  
}