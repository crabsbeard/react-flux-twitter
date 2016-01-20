var actions = require('./actions');
var API = module.exports = {
    fetchChirps: function () {
        fetch('/api/chirps').then(actions.gotChirps.bind(actions));
    }
};

function get(url) {
    return fetch (url, {
        credentials: 'same-origin'
    }).then(function (res) {
        return res.json();
    });
}
