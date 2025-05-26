// test/di-integration.test.js

const container = require('../src/container');
const { initializeServices } = require('../src/service-registration');

// Simple assertion function for this test
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

// Test suite
function describe(suiteName, fn) {
  console.log(`\n--- Test Suite: ${suiteName} ---`);
  try {
    fn();
    console.log(`--- Suite ${suiteName} PASSED ---\n`);
  } catch (error) {
    console.error(`--- Suite ${suiteName} FAILED ---`);
    console.error(error);
    // In a real test runner, this would propagate to fail the test run
    // For this basic setup, we might want to re-throw or process.exit(1) if running standalone
  }
}

// Test case
function it(testName, fn) {
  console.log(`  Running test: ${testName}`);
  try {
    fn();
    console.log(`  Test PASSED: ${testName}`);
  } catch (error) {
    console.error(`  Test FAILED: ${testName}`);
    throw error; // Re-throw to fail the suite
  }
}

describe('DI Container Integration', () => {
  it('should initialize and resolve all core services', () => {
    // Initialize all services
    console.log('  Initializing services...');
    initializeServices();
    console.log('  Services initialized.');

    const serviceNames = [
      'config', 
      'logger', 
      'db', 
      'emailValidator', 
      'serpApiClient', 
      'playwrightScraper', 
      'scrapersService', 
      'clearbitService', 
      'hunterService', 
      'zeroBounceService', 
      'enrichmentService', 
      'sendgridService', 
      'outreachWorker'
    ];

    console.log('  Attempting to resolve services:');
    for (const serviceName of serviceNames) {
      let serviceInstance = null;
      let errorResolving = null;
      try {
        serviceInstance = container.get(serviceName);
      } catch (e) {
        errorResolving = e;
      }

      assert(errorResolving === null, `Error resolving service ${serviceName}: ${errorResolving ? errorResolving.message : 'Unknown error'}`);
      assert(typeof serviceInstance === 'object' && serviceInstance !== null, `Service ${serviceName} not resolved correctly or is not an object. Type: ${typeof serviceInstance}`);
      
      // Check for specific known non-object types if any (e.g. if a factory returns a function directly)
      // For this project, all listed services are expected to be objects (or classes instantiated as objects).
      
      console.log(`    Successfully resolved: ${serviceName} (Type: ${typeof serviceInstance})`);
    }
    console.log('  All essential services resolved successfully.');
  });
});

// If running this file directly (e.g., node test/di-integration.test.js),
// this will execute the tests.
// In a real project, a test runner (Jest, Mocha) would manage this.
if (require.main === module) {
  // This will automatically run the describe block due to how the functions are structured
  // No explicit call needed here.
  console.log("Running DI Integration Test Standalone...");
}

module.exports = {}; // Export something to make it a module
