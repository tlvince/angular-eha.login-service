'use strict';

describe('Service: loginService', function () {

  // Angular modules needed
  var loginService;
  var notificationService;
  var localStorageApi;
  var $q;
  // Fake local store
  var localFake;
  // Fake local pouch
  var pouchSpy;

  // load templates
  beforeEach(module('eha.templates'));

  beforeEach(module('eha.biometricregistration', function($provide) {
    // See contact-service test
    $provide.value('$state', {
        go: jasmine.createSpy('state go')
    });


    // Fake out the little pouch we use in login service
    pouchSpy = jasmine.createSpy('pouch login').andCallFake(function(user, pass) {
      if(user && pass) {
        return $q.when({'ok':true,'name': user,'roles':[]});
      }
      return $q.reject({ status: 401, message: 'Name or password invalid' });
    });
    $provide.value('pouchDB', jasmine.createSpy('pouch constr').andReturn({
      login: pouchSpy
    }));
  }));

  beforeEach(inject(function (_loginService_, _localStorageApi_, _notificationService_, _$q_) {
    localFake = {};
    $q = _$q_;
    loginService = _loginService_;
    notificationService = _notificationService_;
    localStorageApi = _localStorageApi_;

    // General testing strategy for those tests:
    // Mock localStorageApi, make sure things are called
    // return promises
    spyOn(localStorageApi, 'set').andCallFake(function(opts) {
      if(typeof opts === 'object' && Object.keys(opts).length) {
        var vals = Object.keys(opts).map(function(key) {
          localFake[key] = opts[key]; // set to mock
          return opts[key];
        });
        return $q.when(vals);
      }
      throw new Error('cannot convert undefined or null to object');
    });

    spyOn(localStorageApi, 'get').andCallFake(function(item) {
      return $q.when(localFake[item]);
    });

    spyOn(localStorageApi, 'remove').andCallFake(function(items) {
      return $q.all(items.map(function(item) {
        delete localFake[item];
        return $q.when(item);
      }));
    });
  }));

  it('should store credentials', function() {
    runs(function() {
      return loginService.storeCredentials('karl', 'pineapple')
        .then(function() {
          expect(localStorageApi.set.calls.length).toEqual(1);
          expect(localStorageApi.set.calls[0].args[0].username).toEqual('karl');
          expect(localStorageApi.set.calls[0].args[0].password).toEqual('pineapple');
        });
    });
  });


  it('should report valid creds only if both username and pass is there', function() {
    // default: has nothing
    runs(function() {
      return loginService.hasLocalCreds()
        .then(function(hasCreds) {
          expect(hasCreds).toEqual(false);
        });
    });

    // has only username
    runs(function() {
      localFake.username = 'myuser';
      return loginService.hasLocalCreds()
        .then(function(hasCreds) {
          expect(hasCreds).toEqual(false);
        });
    });

    runs(function() {
      localFake.username = 'myuser';
      localFake.password = 'mypass';
      return loginService.hasLocalCreds()
        .then(function(hasCreds) {
          expect(hasCreds).toEqual(true);
        });
    });
  });

  it('should delete creds when logging out', function() {
    localFake.username = 'nicklas';
    localFake.password = 'backstrom';

    runs(function() {
      return loginService.logout()
        .then(function() {
          expect(localFake.username).toBeUndefined();
          expect(localFake.password).toBeUndefined();
          expect(localStorageApi.remove).toHaveBeenCalled();
        });
    });
  });

  it('should renew the session if it has creds', function() {
    localFake.username = 'santa';
    localFake.password = 'claus';

    runs(function() {
      return loginService.renew()
        .then(function() {
          expect(pouchSpy).toHaveBeenCalled(); // remember that one? mmmm
          var logins = pouchSpy.mostRecentCall.args;
          expect(logins[0]).toEqual('santa');
          expect(logins[1]).toEqual('claus');
        });
    });
  });

  it('should not renew session if it doesn’t have creds', function() {
    localFake.username = 'santa';
    localFake.password = undefined; // bam bam bAAAAAAM

    runs(function() {
      return loginService.renew()
        .catch(function(err) {
          expect(pouchSpy).not.toHaveBeenCalled(); // remember that one? mmmm

          // Make it return 401 right now, works with the retrial lopp
          expect(err.status).toEqual(401);
        });
    });
  });
});
