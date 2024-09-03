const EventEmitter = require('events');
class GlobalEventEmitter extends EventEmitter {}

// Export a single instance of the EventEmitter
module.exports = new GlobalEventEmitter();