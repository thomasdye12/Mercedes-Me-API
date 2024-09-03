const fs = require('fs');
const request = require('request');
const { v4: uuidv4 } = require('uuid');

const AuthFile = "auth.json";
let AuthInfo = readAndDecodeJSONFile();
let retryCount = 0;
const axios = require('axios');
const TrackingId = generateUUID();
const SessionId = "14111da2-7844-4ce0-a8b5-67f6c1f14051";
const DeviceID = generateUUID();
console.log("TrackingId: " + TrackingId);
console.log("SessionId: " + SessionId);



function generateUUID() {
  return uuidv4();
}

function refreshToken() {
  if (AuthInfo.expires_at && AuthInfo.expires_at > Date.now()) {
    console.log("Token is still valid. No need to refresh.");
    return;
  }

  // chceck we have the data needed to make the request or return 
  if (!AuthInfo || !AuthInfo.refresh_token) {
    console.log("No refresh token found. Please login again.");
    return
  }

  retryCount++;
  if (retryCount > 5) {
    console.log("Retry count exceeded");
    process.exit(1);
  }

  console.log("Refreshing token");
  var headers = Headers();
  headers["Content-Type"] = "application/x-www-form-urlencoded";

  request.post({
    gzip: true,
    url: "https://id.mercedes-benz.com/as/token.oauth2",
    headers: headers,
    followAllRedirects: false,
    body: "grant_type=refresh_token&refresh_token=" + AuthInfo["refresh_token"],
  }, (err, resp, body) => {
    if (err || (resp && resp.statusCode >= 400) || !body) {
      console.log(resp.statusCode);
      console.log("Error refreshing token");
      return;
    }
    try {
      console.log(body);

      const token = JSON.parse(body);
      token.expires_at = Date.now() + token.expires_in * 1000;
      saveJSONFile(token);
      AuthInfo = token;
      retryCount = 0; // Reset the retry count on successful refresh
    } catch (error) {
      console.log(error);
    }
  });
}

function readAndDecodeJSONFile() {
  try {
    const data = fs.readFileSync(AuthFile, 'utf8');
    const jsonData = JSON.parse(data);
    return jsonData;
  } catch (error) {
    console.log(error);
    return null;
  }
}

function saveJSONFile(data) {
  fs.writeFile(AuthFile, JSON.stringify(data), function (err) {
    if (err) return console.log(err);
  });
}

function Headers() {
  // ensureTokenIsValid();

  return {
    // 'Host': 'id.mercedes-benz.com',
    'ris-os-version': '17.4.1',
    'X-TrackingId': generateUUID(),
    'ris-os-name': 'ios',
    'X-SessionId': SessionId,
    'Accept': '*/*',
    'X-ApplicationName': 'mycar-store-ece',
    'Accept-Language': 'en-US;q=1.0',
    'ris-sdk-version': '2.122.0',
    'User-Agent': 'MyCar/1.46.0 (com.daimler.ris.mercedesme.ece.ios; build:2409; iOS 18.1.0) Alamofire/5.9.1',
    'ris-application-version': '1.46.0 (2409)',
    'Connection': 'keep-alive',
    'X-Locale': 'en-US',
    'Content-Type': 'application/json',
    "Stage": "prod",
    "X-Device-Id": DeviceID,
    "X-Request-Id": generateUUID(),
  };
}

function ensureTokenIsValid() {
  if (AuthInfo.expires_at && AuthInfo.expires_at < Date.now()) {
    refreshToken();
  }
}

function startTokenRefreshInterval() {
  setInterval(() => {
    ensureTokenIsValid();
  }, 60000); // Check every minute
}

function getAuthInfo() {
  return AuthInfo;
}

function setAuthInfo(info) {
  AuthInfo = info;
  saveJSONFile(info);
}



function LoadConfig() {
  let config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: 'https://bff.emea-prod.mobilesdk.mercedes-benz.com/v1/config',
    headers: { 
      'Host': 'bff.emea-prod.mobilesdk.mercedes-benz.com', 
      'X-TrackingId': '28E5586A-5CD9-4F67-8C48-4A57F9FDDDD5', 
      'ris-os-name': 'ios', 
      'X-SessionId': SessionId, 
      'Accept': '*/*', 
      'X-ApplicationName': 'mycar-store-ece', 
      'Accept-Language': 'en-US;q=1.0', 
      'ris-os-version': '18.1', 
      'ris-sdk-version': '2.124.0', 
      'User-Agent': 'MyCar/1.47.0 (com.daimler.ris.mercedesme.ece.ios; build:2446; iOS 18.1.0) Alamofire/5.9.1', 
      'ris-application-version': '1.47.0 (2446)', 
      'Connection': 'keep-alive', 
      'X-Locale': 'en-US'
    }
  };
  
  axios.request(config)
  .then((response) => {
    console.log(JSON.stringify(response.data));
  })
  .catch((error) => {
    console.log(error);
  });

  
}




module.exports = {
  generateUUID,
  refreshToken,
  readAndDecodeJSONFile,
  saveJSONFile,
  Headers,
  getAuthInfo,
  setAuthInfo,
  startTokenRefreshInterval,
  generateUUID,
  DeviceID,
  SessionId,
  LoadConfig

};
