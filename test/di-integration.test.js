// test/di-integration.test.js

const container = require('../src/container');
const { initializeServices } = require('../src/service-registration');

describe('DI Container Integration', () => {
  test('should initialize and resolve all core services', () => {
    // Initialize all services
    initializeServices();

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

    // Test that all services can be resolved without errors
    for (const serviceName of serviceNames) {
      expect(() => {
        const serviceInstance = container.get(serviceName);
        expect(serviceInstance).toBeDefined();
        expect(serviceInstance).not.toBeNull();
        expect(typeof serviceInstance).toBe('object');
      }).not.toThrow();
    }
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
