const express = require('express');
const { v4: uuidv4 } = require('uuid');
const VehicleCommands = require("./Proto/vehicle-commands_pb");
const Client = require("./Proto/client_pb");

// Mock req and res objects
const req = {
    params: {
      CarID: 'WDD2470122J080261', // Replace with your test car ID
    },
    body: {
      command: 'WindowsMove', // Replace with your test command name
    }
  };
  
  const res = {
    send: (data) => {
      console.log("Response:", data);
    }
  };


  
  // Mock the necessary variables
  const Pin = '1121'; // Replace with your PIN

  // Your original code
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

//   vc.setDoorsList([VehicleCommands.Door.FRONT_RIGHT]);


  vc[2] = 2;
  console.log(vc.toObject());
  command["set" + Action](vc);

  //VehicleCommands.Door



  console.log("Command Request:", command.toObject());
  const clientMessage = new Client.ClientMessage();
  clientMessage.setCommandrequest(command);
  
  // Function to send the command and print the serialized output
  const sendcommand = (binaryData) => {
    const base64Data = Buffer.from(binaryData).toString('base64');
  console.log("Serialized Command (Base64):", base64Data); // Print raw protobuf in Base64 format
  };
  sendcommand(clientMessage.serializeBinary());