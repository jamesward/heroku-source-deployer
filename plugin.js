'use strict';

var Promise = require('bluebird');
var fs = require('fs');
var path = require('path');

function dirToTarGz(dir, useGitIgnore) {

  if (useGitIgnore === undefined) {
    useGitIgnore = true;
  }

  // only use the .gitignore if it exists
  useGitIgnore = useGitIgnore & fs.existsSync(path.join(dir, '.gitignore'));

  var stat = Promise.promisify(require('fs').stat);

  return stat(dir).then(function(dirStat) {
    if (!dirStat.isDirectory()) {
      throw new Error('The specifed dir does not exist or is not a directory.');
    }

    return new Promise(function (resolve, reject) {
      var zlib = require('zlib');
      var gzip = zlib.createGzip();
      var tar = require('tar-fs');
      var stream = require('stream');

      var bufs = [];
      var write = new stream.Writable();
      write._write = function(chunk, encoding, next) {
        bufs.push(chunk);
        next();
      };

      var options = {};

      if (useGitIgnore) {
        var parser = require('gitignore-parser');
        var gitignore = parser.compile(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'));

        options.ignore = function(name) {
          return gitignore.denies(name);
        };
      }

      tar.pack(dir, options).pipe(gzip).pipe(write);

      write.on('error', reject);
      write.on('finish', function () {
        resolve(Buffer.concat(bufs));
      });
    });
  });
}

// deploy a dir
function deployDir(apiToken, appName, dir, useGitIgnore) {
  return dirToTarGz(dir, useGitIgnore).then(function(data) {
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
  dirToTarGz: dirToTarGz,
  deploy: deploy,
  deployDir: deployDir,
  buildComplete: buildComplete
};