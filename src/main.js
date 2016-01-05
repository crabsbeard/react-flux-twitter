var actions = require('./actions');

Object.keys(actions).forEach(function (key) {

    console.log(key);
    console.log(actions[key].toString());
});
