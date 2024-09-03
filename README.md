# Mercedes me API

This is a very simple code, it's not the best, but it will help somebody who wants to build a more elaborate system that allows you to communicate using an API with your Mercedes Benz car.

## Getting Started

1. You need to have a registered account in Mercedes me.
2. You need to have a registered car in Mercedes me.
3. Leach have agreed to all the terms and conditions in the Mercedes me app.
4. clone this repository.
5. Install the node modules.
6. Run the code.
7. It can take some ENV of CarPin that is used for auth with the Mercedes API.




## auth.json file

The contents of this file is the auth tokens that are saved from the connection with the Mercedes, this file should be created and populated by the code automatically, but if you want to create it manually you can it shoudl look like this. 
    
    ```json
{
    "access_token": "",
    "token_type": "Bearer",
    "expires_in": 0000,
    "expires_at": 0000
}
```

## end points

### /Login/:username

This end point will allow you to login to your Mercedes me account, you need to pass the username as a parameter, this will send you an email with a code that you will need to use in the next end point.

### /Login_Code/:username/:code

This end point will allow you to login to your Mercedes me account, you need to pass the username and the code that you received in your email as a parameter.

### /Car/:CarID/listStates

This end point will allow you to get the list of states that you can get from your car, you need to pass the CarID as a parameter, this will return a list of states that you can get from your car.
CarID is the VIN number of your car.

### /Car/:CarID/All

This end point will allow you to get all the states that you can get from your car, you need to pass the CarID as a parameter, this will return all the states that you can get from your car.

### /Car/:CarID/:state

This end point will allow you to get a specific state from your car, you need to pass the CarID and the state that you want to get as a parameter, this will return the state that you want to get from your car.

### /Car/:CarID/:command/:second? (POST)

This end point will allow you to send a command to your car, you need to pass the CarID, the command that you want to send and the second that you want to send as a parameter, this will return the state that you want to get from your car.
This is still work in progress, I'm still working on the commands that you can send to your car, there is the abity to lock and unlock now, there should be other things such as remove keys, start car, stop car, open windows, open trunk, open sunroof, etc. coming in the future.

### /Carproto/:base64

This end point will allow you to send a command to your car, in a raw protobuff format, you need to pass the base64 encoded command that you want to send as a parameter, this will return the state that you want to get from your car.

### /token

This end point will allow you to get the token that is used for authentication, this is a JWT, this is usufull if you want to use some of the other apis such as getting car images.