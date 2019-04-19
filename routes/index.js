var express = require('express');
var router = express.Router();
var Hypothesis = require('../models/hypothesis_model');

/* GET home page. */
router.get('/', function(req, res, next) {
  Hypothesis.fetch(function(err, result) {
    console.info('GOT', err, result);
    //TODO result must be converted to HTML
    return res.render('index', { 'data': result });
  });
  
});

module.exports = router;
