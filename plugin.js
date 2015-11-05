'use strict';

var Promise = require('bluebird');

// deploy a dir
function deployDir(apiToken, appName, dir) {

  var stat = Promise.promisify(require('fs').stat);

  var tarGzPromise = stat(dir).then(function(dirStat) {
    if (!dirStat.isDirectory()) {
      throw new Error('The specifed dir does not exist or is not a directory.');
    }

    return new Promise(function (resolve, reject) {
      var stream = require('stream');
      var targz = require('tar.gz');

      var read = targz().createReadStream(dir);

      var bufs = [];
      var write = new stream.Writable({
        write: function (chunk, encoding, next) {
          bufs.push(chunk);
          next();
        }
      });

      // tar gz the dir
      read.pipe(write);

      read.on('error', reject);
      write.on('error', reject);
      write.on('finish', function () {
        resolve(Buffer.concat(bufs));
      });
    });
  });

  return tarGzPromise.then(function(data) {
    return deploy(apiToken, appName, data);
  });
}

// deploy a tarGzBuffer
function deploy(apiToken, appName, tarGzBuffer) {

  if (!apiToken) {
    throw new Error('Missing apiToken');
  }

  if (!appName) {
    throw new Error('Missing appName');
  }

  var heroku = new (require('heroku-client'))({ token: apiToken });

  // create the sources endpoints
  return heroku.apps(appName).sources().create().then(function(sourceInfo) {
    // upload the file this way, cause if it is piped then it is chunked and S3 doesn't handle chunks
    var options = {
      method: 'PUT',
      url: sourceInfo.source_blob.put_url,
      body: tarGzBuffer
    };

    var rp = require('request-promise');

    // upload the file
    return rp(options).then(function() {
      // create a build
      return heroku.apps(appName).builds().create({source_blob: {url: sourceInfo.source_blob.get_url}});
    });

  }).catch(function(err) {
    throw new Error(err.body.message);
  });
}

// poll for completion of the build
function buildComplete(apiToken, appName, buildId) {

  if (!apiToken) {
    throw new Error('Missing apiToken');
  }

  if (!appName) {
    throw new Error('Missing appName');
  }

  var heroku = new (require('heroku-client'))({ token: apiToken });

  return new Promise(function (resolve, reject) {
    // get the build result every 5 seconds until it is completed
    // todo: max retries
    var statusPolling = setInterval(function() {
      heroku.apps(appName).builds(buildId).result().info().then(function(buildResult) {

        if (buildResult.build.status != 'pending') {
          // stop polling because the build is done
          clearInterval(statusPolling);
        }

        if (buildResult.build.status == 'succeeded') {
          resolve(buildResult);
        }
        else if (buildResult.build.status == 'failed') {
          var lines = '';
          buildResult.lines.forEach(function(lineObj) {
            lines += lineObj.line + '\n';
          });
          reject(new Error('Build failed: ' + lines));
        }
      }).catch(function(err) {
        reject(new Error(err.body.message));
      });
    }, 5000);

  });
}

module.exports = {
  deploy: deploy,
  deployDir: deployDir,
  buildComplete: buildComplete
};