//TODO: when the async stuff is working:
//  add a tags database and process each tag against the
//  <em>Id</em> of each annotation
var Http = require('./http/http_request'),
    config = require('../config/config'),
    Cursor = require('../config/cursor'),
    Database = require('nedb'),
    Promise = require('promise'),
    async = require("async"),
    fs = require('fs'),
    path = require('path'),
    HypothesisModel,
    instance;
const CursorPath = path.join(__dirname,"../config/cursor.json");
//@see https://github.com/louischatriot/nedb#creatingloading-a-database
//@see https://futurestud.io/tutorials/node-js-how-to-run-an-asynchronous-function-in-array-map
HypothesisModel = function() {
  var self = this,
      db = new Database({ filename: config.DBPath, autoload: true }),
      FINAL_URL = config.BaseURL+"?group="+config.GroupId,
      client = new Http(config.DeveloperToken);

  
  /**
   * Fetch a block of annotations
   * Called by index.js router
   * @callback (err, data)
   */
  self.fetch = async function(callback) {
    console.info('FETCHING');
    //update the annotations
    async.series([
      //find some annotations to show
      fetchAnnotations,
      
      //TODO this will need a cursor to paginate
      // return some annotations to the router
      function doSearch(callback) {
        db.find({}, function(erx, docs) {
          return callback(erx, docs);
        });
      }
    ]);
  }

  /**
   * Walk along an array of JSON objects looking for the <em>exact</em> field
   * @param {*} hitList 
   * @return
   */
  const gatherHits = async function (hitList) {
    //console.info('HITLIST', hitList);  
    return new Promise(async (resolve, reject) => {
      let hit, jams;
      for (var i=0; i< hitList.length; i++) {
        hit = hitList[i];
        
        if (hit.selector) {
          jams = hit.selector;
          //console.info('$HIT', jams);
          for (var j=0;j<jams.length;j++) {
            if (jams[j].exact) {
              console.info('$JAMS', jams[j].exact.length);
              return resolve(jams[j].exact);
            }
          }
        }
      }
      resolve(''); // no hit found
    })
  }

  /**
   * <p>Process an annotation<p> 
   * <p>Pluck the annotation out of <code>json</code> and
   * turn it into a database object</p>
   * <p>Soon: pluck the tags out and process them
   * against the annotation's <em>id</em> in a tags database</p>
   * @param {*} json 
   */
  const processAnnotation = async function(json) {
    console.info('PROCESSING', json.id);
    var jx, target;
    jx = {};
    jx.id = json.id;
    jx.created = json.created;
    jx.title = json.document.title[0];
    jx.user = json.user.substring(5);
    jx.uri = json.uri;
    jx.notes = json.text;
    target = json.target;
    console.info('$TARGET', target);
    jx.text = await gatherHits(target);
    console.info('$TARGET+');
    //TODO split tags out against URL into another database
    jx.tags = json.tags;

    return new Promise(async (resolve, reject) => {
      console.info('INSERT', jx.id);
      db.insert(jx);
      resolve(json.id);
    });
  };

  /**
   * Hypothes.is will load 20 annotations starting at cursor offset
   * @param {*} cursor 
   * @return cargo
   */
  const loadSomeAnnotations = async function(cursor) {
    console.info('LOADING', cursor);
    return new Promise( async (resolve, reject) => {
      var urx = FINAL_URL+"&offset="+cursor;
      client.fetch(urx, function(err, data) {
        console.info('PERSIST', data);
        var cargo = JSON.parse(data);
        return resolve(cargo);
      });
    });
  }

  /**
   * Persist the current cursor for next time
   * @param {*} currentCursor 
   */
  function saveCursor(currentCursor) {
    var cx = {};
    cx.cursor = currentCursor;
    fs.writeFileSync(CursorPath, JSON.stringify(cx));
  }

  /**
   * Walk an array of annotations
   * @param {*} rows 
   */
  const processAnnotations = async function(rows) {
    //process the rows, creating promises        
    try { 
      let promises = rows.map(processSingleRow)
      const results = await Promise.all(promises);
      console.log('DID', results);
    } catch (e) {
      console.error('DANG', e);
    }
  }

  // Accepts a single row and returns results
  function processSingleRow(json) {
    return new Promise((resolve, reject) => {
      let ix = json.id;
      db.findOne({ id: ix }, function(err, dx) {
        console.log('FFF', ix, dx);
        if (!dx || dx.length === 0) {
          return processAnnotation(json).then( async result => {
              console.info('RETURNED', result);
              resolve(result);
          }).catch(reject);
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * <p>The prime mover</p>
   * <p>Load some annotations starting at the cursor (crsr)</p>
   * <p>Then for each row (annotation), process that annotation</p>
   * @param {*} crsr 
   * @callback cb rowsize -- 0 when nothing available
   */
  const myLoop = function(crsr, cb) {
    console.info('LOOPING', crsr);
    let rowsize = 0, cargo;
    const tasks = [
      async function () {
        cargo = await loadSomeAnnotations(crsr);
        console.info('CARGO', cargo.total);
      },
      async function () {
        if (cargo) {
          let rows = cargo.rows;
          rowsize = rows.length;
          if (rowsize > 0) {
            promise = await processAnnotations(rows);
          }
        }
        console.info('PROMX', rowsize);
      },
    ];
    async.series(tasks, (err, results) => {
      console.log('GULP', rowsize);
      if (err) {
          console.error('SHEUTT', err);
      }
      return cb(rowsize);
    });
  }

  /**
   * Recursively walk along cursor to fetch
   * until nothing returned
   * @param {*} crsr 
   * @return current cursor
   */
  let recursomater = (crsr) => {
    console.info('$RECURS', crsr);
    //Go fetch from this cursor
    myLoop(crsr, function(crx) {
      console.info('GOTRSZ', crsr, crx);
      if  (crx === 0) {
        console.info('$BURP', crsr);
        //nothing left at this crsr, so return it
        return crsr;
      }
        //recurse to walk the new cursor
        return recursomater(crsr+crx);
    })  
  }
  /**
   * Load everything starting from cursor offset
   * Starts from the persisted <em>cursor</em>
   */
  const fetchAnnotations = function() {
    var crsr = Cursor.cursor; // starting value
    //loop until nothing returned
    crsr =  recursomater(crsr);
    //TODO we are not getting here
    console.log('DUNKIN', crsr);
    if (crsr) {
      saveCursor(crsr);
    }
  }

};

if (!instance) {
  instance = new HypothesisModel();
}
module.exports = instance;
