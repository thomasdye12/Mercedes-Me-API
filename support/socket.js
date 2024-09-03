const WebSocket = require('ws');
const VehicleEvents = require("../Proto/vehicle-events_pb");
const Client = require("../Proto/client_pb");
const schedule = require('node-schedule');
const globalEvents = require('./globalEvents');
const { refreshToken, Headers, generateUUID, getAuthInfo, setAuthInfo } = require('./auth');
const request = require('request');
let ws;
let retryCount = 0;
let CarStatesByVin = {};
let CarStatusTimes = {};
// let AuthInfo = getAuthInfo();
const Pin = process.env.CarPin;

function connectWebSocket() {
    refreshToken();
    let authinfo = getAuthInfo();

    if (authinfo.access_token == undefined) {
        console.log("the token has not been set yet")
        setTimeout(() => {
            connectWebSocket();
          }, 7000);
         return;
    }
//   var trackingID = generateUUID();
  var connectionOptions = { headers: Headers() };
  connectionOptions.headers["Authorization"] = getAuthInfo()["access_token"];

  ws = new WebSocket('wss://websocket.emea-prod.mobilesdk.mercedes-benz.com/v2/ws', connectionOptions);

  ws.on('open', () => {
    console.log(Date.now());
    console.log('Connected to the WebSocket server');
  });

  ws.on('message', (data, isBinary) => {
    processData(data, isBinary);
    retryCount = 0;
  });

  ws.on('close', (code, reason) => {
    reason = reason.toString();
    console.log(Date.now());
    console.log('Connection closed:', code, reason);
    refreshToken();
    setTimeout(() => {
      reconnectWebSocket();
    }, 5000);
  });

  ws.on('error', (error) => {
    console.log(Date.now());
    console.error('WebSocket error:', error);
    if (error.message == "Unexpected server response: 403") {
      refreshToken();
      setTimeout(() => {
        reconnectWebSocket();
      }, 5000);
    } else {
      reconnectWebSocket();
    }
  });
}

function dropAndReconnect() {
  console.log('Dropping WebSocket connection...');
  // check if the ws object is defined
  if (ws) {
    ws.close();
  }
  refreshToken();
  setTimeout(() => {
    connectWebSocket();
  }, 9000);
}

function reconnectWebSocket() {
  console.log('Reconnecting WebSocket...');
  refreshToken();
  setTimeout(() => {
    connectWebSocket();
  }, 7000);
}

function processData(data, isBinary) {
  data = isBinary ? data : data.toString();
  try {
    const message = VehicleEvents.PushMessage.deserializeBinary(data).toObject();
    handleReceivedMessage(message);
  } catch (error) {
    console.error("Websocket parse error", error);
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
}

function handleAssignedVehicles(vehicles) {
  console.log(JSON.stringify(vehicles));
  acknowledgeUpdates(vehicles, 'AssignedVehicles');
}

function acknowledgeUpdates(updates, type) {
  const ackCommand = new Client['Acknowledge' + type]();
  const clientMessage = new Client.ClientMessage();
  clientMessage['setAcknowledge' + type](ackCommand);
  if (ws) {
    ws.send(clientMessage.serializeBinary());
  }
  // ws.send(clientMessage.serializeBinary());
}

function handleVepUpdates(vepupdates) {
  if (!Array.isArray(vepupdates.updatesMap)) {
    console.log('rawData is not an array');
    return;
  }
  updateCarStatesByVin(vepupdates.updatesMap);
}

function updateCarStatesByVin(rawData) {
  for (let i = 0; i < rawData.length; i++) {
    if (typeof rawData[i][0] === 'string') {
      if (!CarStatesByVin[rawData[i][0]]) {
        CarStatesByVin[rawData[i][0]] = {};
      }
  
      rawData[i][1].attributesMap.forEach(([key, value]) => {
        const oldValue = CarStatesByVin[rawData[i][0]][key] || {};
        CarStatesByVin[rawData[i][0]][key] = value;
        PostChanges(rawData[i][0], key, value, oldValue);
        globalEvents.emit('carStateChange'+ rawData[i][0], key, value);
        // console.log(`${rawData[i][0]}: ${key}: ${JSON.stringify(value)}`);
      });
    }
  }
}

function PostChanges(CarID, Key, Value, OldValue) {
  const IgnoreKeys = ["vtime", "vehicleDataConnectionState"];
  if (IgnoreKeys.includes(Key)) {
    return;
  }
  if (!CarValueChanged(OldValue, Value)) {
    return;
  }
  manageCarStatus(CarID, Key, Value);
  console.log(`${CarID}: ${Key}: ${Value["changed"]}`);
  SendPost(CarID, Key, Value);
}

function SendPost(CarID, Key, Value) {
  const json = { carid: CarID, state: Key, value: Value };
  request.post({
    gzip: true,
    url: "http://127.0.0.1/app/mercedes/UpdateDeviceDateV2.php",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
}

function CarValueChanged(oldValue, newValue) {
  if (oldValue == {}) return true;
  if (newValue == {}) return true;
  if (newValue["changed"] == false) return false;
  const keysToIgnore = ["timestamp", "timestampInMs", "changed", "serviceIdsList"];
  for (const key in newValue) {
    if (keysToIgnore.includes(key)) continue;
    if (key in oldValue && oldValue[key] != newValue[key]) {
      return true;
    } else {
      return false;
    }
  }
}

function manageCarStatus(CarID, Key, Value) {
  if (!CarStatusTimes[CarID]) {
    CarStatusTimes[CarID] = {};
  }
  if (Key == "vehicleLockState") {
    if (CarStatusTimes[CarID][Key]) {
      CarStatusTimes[CarID][Key].cancel();
    }
    if (Value["intValue"] == 0 || Value["intValue"] == 3) {
      let date = new Date();
      date.setMinutes(date.getMinutes() + 15);
      CarStatusTimes[CarID][Key] = schedule.scheduleJob(date, function () {
        SendPost(CarID, "vehicleLockStateUnlockedFor5Minutes", "15");
      });
    }
  } else if (Key == "ignitionstate") {
    if (CarStatusTimes[CarID]["vehicleLockState"]) {
      CarStatusTimes[CarID]["vehicleLockState"].cancel();
    }
    if (Value["intValue"] == 0) {
      let date = new Date();
      date.setMinutes(date.getMinutes() + 15);
      CarStatusTimes[CarID]["vehicleLockState"] = schedule.scheduleJob(date, function () {
        SendPost(CarID, "vehicleLockStateUnlockedFor5Minutes", "15");
      });
    }
  }
}

function sendcommand(data) {
  
  ws.send(data);
}

module.exports = {
  connectWebSocket,
  dropAndReconnect,
  CarStatesByVin,
  ws,
  sendcommand
};
