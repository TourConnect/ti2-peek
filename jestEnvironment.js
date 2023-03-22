const NodeEnvironment = require('jest-environment-node');
const chalk = require('chalk');

const { debug } = process.env;

class NodeEnvironmentFailFast extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.failedDescribeMap = {};
    this.registeredEventHandler = [];
    this.lastParent = undefined;
  }

  async setup() {
    await super.setup();
    this.global.testEnvironment = this;
  }

  registerTestEventHandler(registeredEventHandler) {
    this.registeredEventHandler.push(registeredEventHandler);
  }

  async executeTestEventHandlers(event, state) {
    for (const handler of this.registeredEventHandler) {
      await handler(event, state);
    }
  }

  async handleTestEvent(event, state) {
    await this.executeTestEventHandlers(event, state);

    switch (event.name) {
      case 'hook_failure': {
        const describeBlockName = event.hook.parent.name;
        this.failedDescribeMap[describeBlockName] = true;
        // hook errors are not displayed if tests are skipped, so display them manually
        console.error(`ERROR: ${describeBlockName} > ${event.hook.type}\n\n`, event.error, '\n');
        break;
      }
      case 'test_fn_success': {
        if (debug) {
          if (this.lastParent !== event.test.parent.name) {
            console.log(`${event.test.parent.name}\n  ${chalk.green('\u2713')} ${event.test.name}`);
          } else {
            console.log(`  ${chalk.green('\u2713')} ${event.test.name}`);
          }
          this.lastParent = event.test.parent.name;
        }
        break;
      }
      case 'test_fn_failure': {
        this.failedDescribeMap[event.test.parent.name] = true;
        if (debug) {
          if (this.lastParent !== event.test.parent.name) {
            console.log(`${event.test.parent.name}\n  ${chalk.red('\u2715')} ${event.test.name}`);
          } else {
            console.log(`  ${chalk.red('\u2715')} ${event.test.name}`);
          }
          this.lastParent = event.test.parent.name;
          console.error(event.error.message);
        }
        break;
      }
      case 'test_start': {
        if (this.failedDescribeMap[event.test.parent.name]) {
          event.test.mode = 'skip';
        }
        break;
      }
    }

    if (super.handleTestEvent) {
      super.handleTestEvent(event, state);
    }
  }

  async teardown() {
    await super.teardown();
  }
}
module.exports = NodeEnvironmentFailFast;
