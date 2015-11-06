'use strict';

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var assert = chai.assert;
chai.use(chaiAsPromised);

var fs = require('fs');
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
    return assert.eventually.isBelow(herokuSourceDeployer.dirToTarGz('.').then(function(d) {return d.length;}), 5000000);
  });

  it('deploy should fail when the dir does not exist', function() {
    return assert.isRejected(herokuSourceDeployer.deployDir(apiToken, 'foo', 'foo'), /no such file or directory, stat 'foo'/);
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