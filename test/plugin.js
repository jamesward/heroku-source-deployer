'use strict';

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var assert = chai.assert;
chai.use(chaiAsPromised);

var fs = require('fs');
var path = require('path');
var herokuSourceDeployer = require('../');

var apiToken = process.env.HEROKU_ACCESS_TOKEN;

describe('heroku-source-deployer', function() {

  var heroku = new (require('heroku-client'))({ token: apiToken });

  var appName;

  before(function(done) {
    heroku.apps().create().then(function(data) {
      appName = data.name;
      done();
    }).catch(function(err) {
      done(err);
    });
  });

  it('dirToTarGz should create a tar.gz and apply the .gitignore', function() {
    this.timeout(10000);

    var tmp = require('tmp');
    var tmpDir = tmp.dirSync().name;

    var untgzPromise = herokuSourceDeployer.dirToTarGz('.').then(function(data) {
      return new Promise(function(resolve, reject) {
        var zlib = require('zlib');
        var tar = require('tar-fs');

        var stream = require('stream');

        var gunzipBuffer = zlib.gunzipSync(data);
        var bufferStream = new stream.PassThrough();
        bufferStream.end(gunzipBuffer);
        var write = bufferStream.pipe(tar.extract(tmpDir));
        write.on('error', reject);
        write.on('finish', resolve);
      });
    });

    var gitIgnoreCheckPromise = untgzPromise.then(function() {
      return new Promise(function(resolve, reject) {
        var nodeModulesExists = fs.existsSync(path.join(tmpDir, "node_modules", "tar-fs"));
        var testAppIndexPhpExists = fs.existsSync(path.join(tmpDir, "test", "app", "index.php"));

        if (!nodeModulesExists && testAppIndexPhpExists) {
          resolve("The .gitignore was applied correctly");
        }
        else {
          reject("The .gitignore was not applied correctly");
        }
      });
    });

    return assert.isFulfilled(gitIgnoreCheckPromise);
  });

  it('deploy should fail when the dir does not exist', function() {
    return assert.isRejected(herokuSourceDeployer.deployDir(apiToken, 'foo', 'foo'), /stat 'foo'/);
  });

  it('deploy should fail with an invalid appName', function() {
    return assert.isRejected(herokuSourceDeployer.deployDir(apiToken, 'foo', 'test/app'), /You do not have access to the app foo/);
  });

  it('deploy should fail with an invalid apiToken', function() {
    return assert.isRejected(herokuSourceDeployer.deployDir('foo', appName, 'test/app'), /Invalid credentials provided/);
  });

  it('deploy should start with a valid file', function() {
    this.timeout(15000);
    var fileBuffer = fs.readFileSync('test/app/index.php');
    return assert.isFulfilled(herokuSourceDeployer.deploy(apiToken, appName, fileBuffer));
  });

  it('deploy should succeed with a valid tgz', function() {
    this.timeout(60000);

    var deploy = herokuSourceDeployer.deployDir(apiToken, appName, 'test/app').then(function(buildInfo) {
      return herokuSourceDeployer.buildComplete(apiToken, appName, buildInfo.id);
    });

    return assert.eventually.deepPropertyVal(deploy, 'build.status', 'succeeded');
  });

  after(function(done) {
    heroku.apps(appName).delete().then(function(data) {
      done();
    }).catch(function(err) {
      done(err);
    });
  });

});