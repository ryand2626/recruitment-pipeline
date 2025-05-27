const ApifyService = require('../../src/scrapers/apify-service'); // Adjust path as per your structure
const ActorRunner = require('../../src/scrapers/ActorRunner'); // Adjust path
const logger = require('../../src/utils/logger'); // Adjust path

// Mock dependencies
jest.mock('../../src/scrapers/ActorRunner');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Dynamic mock for config to allow modification per test suite
let mockConfig;
jest.mock('../../config/config', () => {
  // This factory function will be called by Jest to get the mock
  // It allows us to change mockConfig in beforeEach
  return {
    get apify() { return mockConfig.apify; },
    get jobTitles() { return mockConfig.jobTitles; },
    // Add other parts of config if ApifyService starts using them
  };
});

describe('ApifyService', () => {
  let apifyService;
  let mockActorRunnerInstance;

  beforeEach(() => {
    // Reset mocks and default config for each test
    jest.clearAllMocks();

    // Default mock config
    mockConfig = {
      apify: {
        useApify: true,
        token: 'test-token',
        actors: [
          {
            actorId: 'actor/google-search',
            name: 'Google Search Scraper',
            defaultInput: { query: 'default query', maxItems: 10 },
            overridesByJobTitle: {
              'Engineer': { maxItems: 5, country: 'US' },
              'Product Manager': { query: 'product manager query', resultsPerPage: 20, nested: { propA: 'pm_A' } },
            },
          },
          {
            actorId: 'actor/profile-scraper',
            name: 'Profile Scraper',
            defaultInput: { fields: ['name', 'title'], source: 'linkedin' },
            overridesByJobTitle: {
              'Engineer': { fields: ['name', 'title', 'skills'] },
            },
          },
        ],
      },
      jobTitles: ['Engineer', 'Product Manager', 'Designer'], // Example job titles
    };

    // Mock ActorRunner implementation for this test suite
    mockActorRunnerInstance = {
      run: jest.fn().mockResolvedValue([]), // Default to resolve with empty array
    };
    ActorRunner.mockImplementation(() => mockActorRunnerInstance);

    apifyService = new ApifyService();
  });

  describe('Configuration Handling', () => {
    it('should not run actors if useApify is false', async () => {
      mockConfig.apify.useApify = false;
      const results = await apifyService.runActors();
      expect(results).toEqual([]);
      expect(mockActorRunnerInstance.run).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Apify usage is disabled in the configuration. Skipping Apify actor runs.');
    });

    it('should not run actors if actors array is missing or empty', async () => {
      mockConfig.apify.actors = [];
      let results = await apifyService.runActors();
      expect(results).toEqual([]);
      expect(mockActorRunnerInstance.run).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('No Apify actors configured. Nothing to run.');

      jest.clearAllMocks(); // Clear mocks for next check
      mockConfig.apify.actors = null; // Test with null
      results = await apifyService.runActors();
      expect(results).toEqual([]);
      expect(mockActorRunnerInstance.run).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('No Apify actors configured. Nothing to run.');
    });
    
    it('should skip actor if actorId is missing', async () => {
      mockConfig.apify.actors = [{ name: 'Invalid Actor No ID', defaultInput: {} }];
      const results = await apifyService.runActors();
      expect(results).toEqual([]);
      expect(mockActorRunnerInstance.run).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('Found an actor configuration without an actorId. Skipping.', mockConfig.apify.actors[0]);
    });
  });

  describe('Input Merging Logic', () => {
    it('should use defaultInput when no overrides are provided', async () => {
      mockActorRunnerInstance.run.mockResolvedValueOnce([{ id: 1, data: 'result1' }]);
      await apifyService.runActors();
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/google-search',
        { query: 'default query', maxItems: 10 }
      );
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/profile-scraper',
        { fields: ['name', 'title'], source: 'linkedin' }
      );
    });

    it('should apply matching overridesByJobTitle', async () => {
      await apifyService.runActors('Engineer');
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/google-search',
        { query: 'default query', maxItems: 5, country: 'US' } // maxItems and country overridden
      );
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/profile-scraper',
        { fields: ['name', 'title', 'skills'], source: 'linkedin' } // fields array replaced
      );
    });

    it('should use defaultInput if jobTitle does not match any overridesByJobTitle', async () => {
      await apifyService.runActors('Designer'); // 'Designer' has no specific overrides in mockConfig
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/google-search',
        mockConfig.apify.actors[0].defaultInput // Should be default
      );
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/profile-scraper',
        mockConfig.apify.actors[1].defaultInput // Should be default
      );
    });

    it('should apply runtimeOverrides with highest precedence', async () => {
      const runtimeOverrides = {
        'actor/google-search': { maxItems: 1, newParam: 'runtime' },
      };
      await apifyService.runActors('Engineer', runtimeOverrides);
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/google-search',
        { query: 'default query', maxItems: 1, country: 'US', newParam: 'runtime' } // maxItems from runtime, country from jobTitle, newParam from runtime
      );
      // Profile scraper should still use jobTitle overrides as no runtime override for it
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/profile-scraper',
        { fields: ['name', 'title', 'skills'], source: 'linkedin' }
      );
    });

    it('should handle deep merging and array replacement correctly', async () => {
      const runtimeOverrides = {
        'actor/google-search': { 
          maxItems: 1, 
          nested: { propB: 'runtime_B' } // This should merge with jobTitle's nested if any, or default's
        },
         'actor/profile-scraper': {
            fields: ['runtime_field'] // This array should replace jobTitle's and default's
         }
      };
      // Job title "Product Manager" has nested.propA for google-search
      // Job title "Engineer" has different fields for profile-scraper
      await apifyService.runActors('Product Manager', runtimeOverrides);
      
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/google-search',
        { 
          query: 'product manager query', // from jobTitle override
          resultsPerPage: 20,             // from jobTitle override
          maxItems: 1,                    // from runtime override
          nested: {                       // deep merged
            propA: 'pm_A',                // from jobTitle override
            propB: 'runtime_B'            // from runtime override
          }
        }
      );
      expect(mockActorRunnerInstance.run).toHaveBeenCalledWith(
        'actor/profile-scraper',
        { fields: ['runtime_field'], source: 'linkedin' } // fields array replaced by runtime
      );
    });
    
    it('should ignore runtimeOverrides for actors not in config', async () => {
        const runtimeOverrides = {
            'non-existent-actor': { param: 'value' }
        };
        await apifyService.runActors(null, runtimeOverrides);
        // Ensure run was called for configured actors, and not for 'non-existent-actor'
        expect(mockActorRunnerInstance.run).toHaveBeenCalledWith('actor/google-search', expect.anything());
        expect(mockActorRunnerInstance.run).toHaveBeenCalledWith('actor/profile-scraper', expect.anything());
        expect(mockActorRunnerInstance.run).not.toHaveBeenCalledWith('non-existent-actor', expect.anything());
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Final input for actor actor/google-search"));
    });
  });

  describe('ActorRunner Interaction and Result Processing', () => {
    it('should call ActorRunner.run for each configured actor with correctly merged input', async () => {
      mockActorRunnerInstance.run
        .mockResolvedValueOnce([{ id: 1, data: 'google_result' }])
        .mockResolvedValueOnce([{ id: 2, data: 'profile_result' }]);

      const results = await apifyService.runActors();

      expect(mockActorRunnerInstance.run).toHaveBeenCalledTimes(2);
      expect(mockActorRunnerInstance.run).toHaveBeenNthCalledWith(1, 
        'actor/google-search', 
        mockConfig.apify.actors[0].defaultInput
      );
      expect(mockActorRunnerInstance.run).toHaveBeenNthCalledWith(2, 
        'actor/profile-scraper', 
        mockConfig.apify.actors[1].defaultInput
      );
      expect(results).toEqual([
        { id: 1, data: 'google_result' },
        { id: 2, data: 'profile_result' },
      ]);
    });

    it('should return empty array if an actor returns no items', async () => {
        mockActorRunnerInstance.run
            .mockResolvedValueOnce([]) // First actor returns no items
            .mockResolvedValueOnce([{ id: 2, data: 'profile_result' }]);
        
        const results = await apifyService.runActors();
        expect(results).toEqual([{ id: 2, data: 'profile_result' }]);
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Actor actor/google-search returned no items'));
    });
  });

  describe('Error Handling', () => {
    it('should log an error and continue if ActorRunner.run throws for one actor', async () => {
      mockActorRunnerInstance.run
        .mockRejectedValueOnce(new Error('Google actor failed'))
        .mockResolvedValueOnce([{ id: 2, data: 'profile_result' }]);

      const results = await apifyService.runActors();

      expect(logger.error).toHaveBeenCalledWith(
        "An error occurred while running actor actor/google-search via ActorRunner: Google actor failed",
        expect.any(Error)
      );
      // Should still process the second actor and return its results
      expect(results).toEqual([{ id: 2, data: 'profile_result' }]);
      expect(mockActorRunnerInstance.run).toHaveBeenCalledTimes(2);
    });

    it('should return empty array if all actors fail', async () => {
      mockActorRunnerInstance.run.mockRejectedValue(new Error('Actor failed'));
      const results = await apifyService.runActors();
      expect(results).toEqual([]);
      expect(logger.error).toHaveBeenCalledTimes(mockConfig.apify.actors.length); // Called for each actor
    });
  });
});

describe('ApifyService - Input Merging Edge Cases (Array Replacement)', () => {
  let apifyService;
  let mockActorRunnerInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { // Simplified config for this specific test
      apify: {
        useApify: true,
        token: 'test-token',
        actors: [
          {
            actorId: 'test-actor',
            defaultInput: { list: [1, 2], item: 'default' },
            overridesByJobTitle: {
              'TestJob': { list: [3, 4], item: 'job' },
            },
          },
        ],
      },
    };
    mockActorRunnerInstance = { run: jest.fn().mockResolvedValue([]) };
    ActorRunner.mockImplementation(() => mockActorRunnerInstance);
    apifyService = new ApifyService();
  });

  it('should replace arrays from defaultInput with arrays from jobTitleOverrides', async () => {
    await apifyService.runActors('TestJob');
    expect(mockActorRunnerInstance.run).toHaveBeenCalledWith('test-actor', {
      list: [3, 4], // Replaced
      item: 'job',  // Overridden
    });
  });

  it('should replace arrays from jobTitleOverrides with arrays from runtimeOverrides', async () => {
    const runtimeOverrides = { 'test-actor': { list: [5, 6], item: 'runtime' } };
    await apifyService.runActors('TestJob', runtimeOverrides);
    expect(mockActorRunnerInstance.run).toHaveBeenCalledWith('test-actor', {
      list: [5, 6],   // Replaced by runtime
      item: 'runtime',// Overridden by runtime
    });
  });

   it('should replace arrays from defaultInput with arrays from runtimeOverrides when no jobTitle or jobTitle override', async () => {
    const runtimeOverrides = { 'test-actor': { list: [7, 8] } };
    await apifyService.runActors(null, runtimeOverrides); // No job title
    expect(mockActorRunnerInstance.run).toHaveBeenCalledWith('test-actor', {
      list: [7, 8],         // Replaced by runtime
      item: 'default',      // From default
    });
  });
});
