var router =module.exports= require('express').Router();

var db = new(require('locallydb'))('./.data');
var chirps = db.collection('chirps');

router.route('/api/chirps')
    .all(login.required)
    .get(function (req, res) {
        res.json(chirps.toArray());
    })
    .post(function (req, res) {
        var chirp = req.body;
        chipr.userId = req.user.cid;

        //TO BE REMOVED

        chirp.username  =   req.user.username;
        chirp.email     =   req.user.email;
        chirp.fullname  =   req.user.fullname;
        
        var id = chirps.insert(chirps);
        res.json(chirps.get(id));
    });
