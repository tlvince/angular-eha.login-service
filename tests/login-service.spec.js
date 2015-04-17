(function() {
  /*global localforage*/
  'use strict';

  function digest() {
    inject(function($rootScope) {
      $rootScope.$digest();
    });
  }

  function digestIt(original) {
    return function(description, testFn) {
      var isAsync = testFn.length >= 1;
      var fn = !isAsync ? testFn : function(done) {
        testFn(done);
        digest();
      };
      original(description, fn);
    };
  }

  // test helper/override thing
  it = digestIt(it); // jshint ignore:line

  // Angular modules needed
  var loginService;
  var $q;
  var $rootScope;
  // Fake local store
  // var localforage;
  // Fake local pouch
  var pouchSpy;
  var localFake = {};
  var ehaLoginServiceProvider;

  beforeEach(module(function($provide) {
    // Fake out the little pouch we use in login service
    pouchSpy = sinon.spy(function(user, pass) {
      if (user && pass) {
        return $q.when({'ok':true, 'name': user, 'roles':[]});
      }
      return $q.reject({status: 401, message: 'Name or password invalid'});
    });

    $provide.value('pouchDB', sinon.spy(function() {
      return {
        login: pouchSpy
      };
    }));
  }));

  beforeEach(function(done) {
    try {
      localforage.setItem.restore();
      localforage.getItem.restore();
      localforage.removeItem.restore();
    } catch (e) {
      // it didn't run yet.
    }

    localFake = {};
    sinon.stub(localforage, 'setItem', function(key, value, callback) {
      localFake[key] = value;

      if (callback) {
        callback(null);
      }

      return Promise.resolve();
    });

    sinon.stub(localforage, 'getItem', function(key, callback) {
      if (callback) {
        callback(null, localFake[key]);
      }
      return Promise.resolve(localFake[key]);
    });

    sinon.stub(localforage, 'removeItem', function(key, callback) {
      delete localFake[key];
      if (callback) {
        callback(null);
      }
      return Promise.resolve();
    });

    // finally, reset the localforge
    localforage.clear(function() {
      done();
    });
  });

  beforeEach(function() {
    angular.module('eha.login-service.test', function() {
    }).config(function(_ehaLoginServiceProvider_) {
      ehaLoginServiceProvider = _ehaLoginServiceProvider_;
      _ehaLoginServiceProvider_.config({
        database: 'my_db_url',
        // notificationService: function() {
        //   return $q.when(['my_username', 'my_password']);
        // }
      });
    });

    // I don't quite understand why this works, but I need it to do config
    // magic.
    module('eha.login-service', 'eha.login-service.test');

    inject(function(_$q_, _ehaLoginService_, _$rootScope_) {
      $q = _$q_;
      loginService = _ehaLoginService_;
      $rootScope = _$rootScope_;
    });
  });

  describe('Service: loginService', function() {
    it('should store credentials', function(done) {
      loginService.storeCredentials('karl', 'pineapple')
        .then(function() {
          expect(localforage.setItem.calledOnce);
          expect(localforage.setItem.withArgs('username', 'karl').calledOnce);
          expect(localforage.setItem.withArgs('password', 'pineapple').calledOnce);
          done();
        });
    });

    it('should report valid creds only if both username and pass is there', function(done) {
      // default: has nothing
      new Promise(function(resolve) {
        loginService.hasLocalCreds().then(function(hasCreds) {
          expect(hasCreds).to.equal(false);
          resolve();
        });
      }).then(function() {
        return localforage.setItem('username', 'myuser', function() {
          loginService.hasLocalCreds().then(function(hasCreds) {
            expect(hasCreds).to.equal(false);
          });
          digest();
        });
      }).then(function() {
        return Promise.all([
          localforage.setItem('username', 'myuser'),
          localforage.setItem('password', 'mypass')
        ]).then(function() {
          loginService.hasLocalCreds().then(function(hasCreds) {
            expect(hasCreds).to.equal(true);
            done();
          });
          digest();
        });
      }).catch(function(error) {
        console.log(error.message);
        done(error);
      });
    });

    it('should delete creds when logging out', function(done) {
      Promise.all([
        localforage.setItem('username', 'nicklas'),
        localforage.setItem('password', 'backstrom'),
      ]).then(function() {
        loginService.logout().then(function() {
          expect(localFake.username).to.be.undefined;
          expect(localFake.password).to.be.undefined;
          expect(localforage.removeItem.called);
        });
        digest();
      }).then(done).catch(done);
    });

    it('should renew the session if it has creds', function(done) {
      localFake.username = 'santa';
      localFake.password = 'claus';

      loginService.renew().then(function() {
        expect(pouchSpy.called);
        var logins = pouchSpy.lastCall;
        expect(pouchSpy).to.have.been.calledWith('santa', 'claus');
        done();
      });
    });

    it('should not renew session if it doesn’t have creds', function(done) {
      localFake.username = 'santa';
      localFake.password = undefined; // bam bam bAAAAAAM

      loginService.renew().catch(function(err) {
        expect(pouchSpy.callCount === 0);

        // Make it return 401 right now, works with the retrial lopp
        expect(err.status).to.equal(401);
        done();
      });
    });

    it('should prompt user for creds if it doesn’t have any', function(done) {
      ehaLoginServiceProvider.config({
        notificationService: function() {
          var defer = $q.defer();

          setTimeout(function() {
            defer.resolve(['remy', 'password']);
            digest();
          }, 100);

          return defer.promise;
        }
      });

      inject(function(ehaLoginService) {
        ehaLoginService.maybeShowLoginUi().then(function(creds) {
          expect(creds).deep.equal(['remy', 'password']);
          ehaLoginService.maybeShowLoginUi().then(function(creds) {
            expect(creds).deep.equal(['remy', 'password']);
            done();
          });
        });
      });
    });
  });

})();
