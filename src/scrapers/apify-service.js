const config = require('../../config/config');
const ActorRunner = require('./ActorRunner');
const logger = require('../utils/logger');
const mergeWith = require('lodash.mergewith'); // Assuming lodash.mergewith will be available

// Customizer for _.mergeWith to handle array replacements instead of merging
// For this specific use case, we want arrays from overriding objects to replace arrays from the source.
// For other properties, the default merge behavior is fine.
function mergeCustomizer(objValue, srcValue) {
  if (Array.isArray(objValue)) {
    return srcValue; // If the source (override) value is an array, it replaces the destination (default) array
  }
  // For non-array properties, undefined means _.mergeWith will use its default merging strategy.
}

class ApifyService {
  constructor() {
    this.actorRunner = new ActorRunner();
  }

  /**
   * Runs configured Apify actors with optional overrides.
   * @param {string} [jobTitle] - Optional job title to apply specific actor input overrides.
   * @param {object} [runtimeOverrides] - Optional runtime overrides for actor inputs, keyed by actorId.
   * @returns {Promise<Array>} A promise that resolves to a flattened array of items from all successful actor runs.
   */
  async runActors(jobTitle, runtimeOverrides = {}) {
    if (!config.apify.useApify) {
      logger.info('Apify usage is disabled in the configuration. Skipping Apify actor runs.');
      return [];
    }

    const actorConfigs = config.apify.actors;
    if (!actorConfigs || actorConfigs.length === 0) {
      logger.warn('No Apify actors configured. Nothing to run.');
      return [];
    }

    let allResults = [];

    for (const actorConfig of actorConfigs) {
      if (!actorConfig || !actorConfig.actorId) {
        logger.warn('Found an actor configuration without an actorId. Skipping.', actorConfig);
        continue;
      }
      const actorId = actorConfig.actorId; // Use actorId for clarity and consistency
      logger.info(`Processing actor: ${actorId} (Name: ${actorConfig.name || 'N/A'})`);

      // 1. Compute finalInput with deep merging
      // Start with a deep copy of defaultInput to avoid modifying the original config
      let finalInput = JSON.parse(JSON.stringify(actorConfig.defaultInput || {}));

      // Apply jobTitle overrides if jobTitle is provided and overrides exist for it
      if (jobTitle && actorConfig.overridesByJobTitle && actorConfig.overridesByJobTitle[jobTitle]) {
        const jobTitleOverrides = actorConfig.overridesByJobTitle[jobTitle];
        logger.info(`Applying job title overrides for "${jobTitle}" to actor ${actorId}: ${JSON.stringify(jobTitleOverrides)}`);
        // Ensure deep merge, especially for nested objects. Arrays from jobTitleOverrides should replace defaultInput arrays.
        finalInput = mergeWith({}, finalInput, jobTitleOverrides, mergeCustomizer);
      }

      // Apply runtimeOverrides if provided for the current actor
      // These have the highest precedence.
      if (runtimeOverrides[actorId]) {
        const currentActorRuntimeOverrides = runtimeOverrides[actorId];
        logger.info(`Applying runtime overrides to actor ${actorId}: ${JSON.stringify(currentActorRuntimeOverrides)}`);
        // Arrays from runtimeOverrides should replace arrays from the current finalInput.
        finalInput = mergeWith({}, finalInput, currentActorRuntimeOverrides, mergeCustomizer);
      }
      
      // 2. Log the final input (conceptual validation)
      logger.info(`Final input for actor ${actorId}: ${JSON.stringify(finalInput, null, 2)}`);
      // TODO: Implement actual input validation against a schema in the future.
      // For now, we assume the input is valid if it's constructed.
      // If validation were to fail:
      // logger.error(`Invalid final input for actor ${actorId}. Skipping run.`);
      // continue;

      try {
        // 3. Invoke ActorRunner.run
        logger.info(`Running actor ${actorId} with ActorRunner...`);
        const items = await this.actorRunner.run(actorId, finalInput);
        if (items && items.length > 0) {
          // Store actorId along with items for better traceability before flattening, if needed.
          // For now, just add to results.
          allResults.push(...items); // Flatten results immediately
          logger.info(`Actor ${actorId} successfully returned ${items.length} items.`);
        } else {
          logger.info(`Actor ${actorId} returned no items or failed (ActorRunner handles logging of failure).`);
        }
      } catch (error) {
        logger.error(`An error occurred while running actor ${actorId} via ActorRunner: ${error.message}`, error);
        // Optionally, collect error information or re-throw if higher level handling is needed
      }
    }

    // 4. (Conceptual for now) Map raw items - currently returning raw items
    // Flattening is done when pushing items into allResults

    logger.info(`Completed processing all Apify actors. Total items retrieved: ${allResults.length}`);
    return allResults;
  }
}

module.exports = ApifyService;
