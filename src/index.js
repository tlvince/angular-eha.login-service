;(function() {
  'use strict';

  /* globals prompt*/ // nasty

  var ngModule = angular.module('eha.login-service', [])
  .value('localforage', window.localforage)
  .provider('loginService', function() {
    var $q;
    var DB_NAME = null;

    // notificationService is a promise that must resolve with an array
    // containing the username & password.
    var notificationService = function() {
      var username = prompt('Username?');
      var password = prompt('Password?');
      return $q.when([username, password]);
    };

    this.config = function(options) {
      if (options.notificationService) {
        // `fn` must return a promise
        if (typeof notificationService !== 'function') {
          throw new Error('notificationService must be a function that ' +
            'returns a promise');
        }
        notificationService = options.notificationService;
      }

      if (options.database) {
        DB_NAME = options.database;
      }
    };

    this.$get = function(
      _$q_,
      localforage,
      pouchDB
    ) {
      // FIXME unsure if this will work...
      $q = _$q_;

      var loginService = this;

      var _db; // cached db connection
      var db = function() {
        if (!DB_NAME) {
          throw new Error('loginService must be configured with ' +
            ' .config({ database: "<url/db_name to couchdb>"');
        }

        _db = _db || pouchDB(DB_NAME);
        return _db;
      };

      var storeCredentials = function(username, password) {
        var promises = [
          localforage.set('username', username),
          localforage.set('password', password),
        ];

        return $q.all(promises);
      };

      var getUserPass = function() {
        return $q.all([
          localforage.get('username'),
          localforage.get('password')
        ]);
      };

      var hasDatabaseCredentials = function() {
        return getUserPass().then(function(creds) {
          // Couch requires both username and password
          // Otherwise it'll return a 400 Bad Request
          return !!(creds[0] && creds[1]);
        });
      };

      loginService.maybeShowLoginUi = function() {
        return hasDatabaseCredentials().then(function(has) {
          if (has) {
            return getUserPass();
          } else {
            return notificationService.then(function(creds) {
                // $q promise can only take one value
                return storeCredentials.apply(null, creds);
              })
              .then(getUserPass);
          }
        });
      };

      loginService.hasLocalCreds = function() {
        return hasDatabaseCredentials();
      };

      loginService.login = function(username, password) {
        return db().login(username, password);
      };

      loginService.renew = function() {
        return hasDatabaseCredentials().then(function(has) {
          if (has) {
            return getUserPass().then(function(res) {
              return loginService.login(res[0], res[1]);
            });
          }

          // Check the retriable service if changing this
          return $q.reject({status: 401, message: 'credentials not found'});
        });
      };

      // FIXME this could mess things up https://github.com/eHealthAfrica/BiometricRegistration/blob/f1492732380322aca7415defd7dcb222034750f2/app/scripts/services/logout.js#L5
      loginService.logout = function() {
        return $q.all([
          localforage.remove('username'),
          localforage.remove('password'),
        ]);
      };

      loginService.storeCredentials = function(username, password) {
        return storeCredentials(username, password);
      };

      return loginService;

    };
  });

  // Check for and export to commonjs environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ngModule;
  }

})();
