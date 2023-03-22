/* globals expect */
// should not require internals but is the only way to make it work on nested instances
const { equals } = require('expect/build/jasmineUtils');
const { diff: diffDefault } = require('jest-diff');

require('util').inspect.defaultOptions.depth = 8;

expect.extend({
  toContainObject(receivedParam, argument) {
    const received = (() => {
      if (Array.isArray(receivedParam)) return receivedParam;
      return [receivedParam];
    })();
    const pass = (() => {
      if (Array.isArray(argument)) {
        return equals(received, 
          expect.arrayContaining(argument.map(arg => expect.objectContaining(arg)))
        );
      }
      return equals(received, 
        expect.arrayContaining([
          expect.objectContaining(argument)
        ])
      );
    })();
    if (pass) {
      return {
        message: () => (`expected ${this.utils.printReceived(received)} not to contain object ${this.utils.printExpected(argument)}`),
        pass: true
      }
    } else {
      return {
        message: () => (diffDefault(received, argument)),
        pass: false
      }
    }
  }
});
