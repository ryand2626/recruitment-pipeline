const { ApifyClient } = require('apify-client');
const logger = require('../utils/logger'); // Assuming logger is in ../utils/
const config = require('../../config/config'); // Assuming config is in ../../config

class ActorRunner {
  constructor() {
    this.apifyClient = new ApifyClient({
      token: config.apify.token,
    });
  }

  /**
   * Runs an Apify actor and retrieves its results.
   * @param {string} actorName - The name or ID of the Apify actor (e.g., "username/actor-name").
   * @param {object} inputObject - The input object for the actor.
   * @returns {Promise<Array>} A promise that resolves to an array of items from the actor's dataset.
   *                           Returns an empty array if the run fails or yields no items.
   */
  async run(actorName, inputObject) {
    logger.info(`Starting Apify actor: ${actorName} with input: ${JSON.stringify(inputObject, null, 2)}`);

    let run;
    try {
      // Start the actor
      run = await this.apifyClient.actor(actorName).start(inputObject, { waitForFinish: 2 * 60 }); // Wait for 2 minutes for the run to start and potentially finish
      
      logger.info(`Apify actor ${actorName} started. Run ID: ${run.id}, Status: ${run.status}`);

      // Wait for the run to finish
      // The 'waitForFinish' option in start() might make this redundant if it waits for full completion.
      // However, ApifyClient's start() with waitForFinish might only wait for the run to be *created* and *started*, not necessarily *finished*.
      // Explicitly waiting for finish is safer.
      // ApifyClient.waitForFinish returns the run object once it's finished.
      logger.info(`Waiting for Apify actor ${actorName} (Run ID: ${run.id}) to finish...`);
      const finishedRun = await this.apifyClient.run(run.id).waitForFinish();

      logger.info(`Apify actor ${actorName} (Run ID: ${run.id}) finished with status: ${finishedRun.status}`);

      if (finishedRun.status !== 'SUCCEEDED') {
        logger.error(`Apify actor ${actorName} (Run ID: ${run.id}) did not succeed. Status: ${finishedRun.status}. Full run details: ${JSON.stringify(finishedRun, null, 2)}`);
        // Attempt to get error details if available (structure might vary)
        if (finishedRun.output && finishedRun.output.contentType === 'application/json') {
            const errorDetails = await this.apifyClient.keyValueStore(finishedRun.defaultKeyValueStoreId).getRecord('OUTPUT');
            logger.error(`Error details for run ${run.id}: ${JSON.stringify(errorDetails.value, null, 2)}`);
        }
        return []; // Return empty array on failure
      }

      // Fetch the results from the default dataset
      logger.info(`Fetching results for Apify actor ${actorName} (Run ID: ${run.id}, Dataset ID: ${finishedRun.defaultDatasetId})...`);
      const { items } = await this.apifyClient.dataset(finishedRun.defaultDatasetId).listItems();

      if (!items || items.length === 0) {
        logger.warn(`Apify actor ${actorName} (Run ID: ${run.id}) completed successfully but returned no items.`);
        return [];
      }

      logger.info(`Apify actor ${actorName} (Run ID: ${run.id}) returned ${items.length} items.`);
      return items;

    } catch (error) {
      logger.error(`Error running Apify actor ${actorName}: ${error.message}`);
      if (run && run.id) {
        logger.error(`Error occurred for Run ID: ${run.id}. Full error: ${JSON.stringify(error, null, 2)}`);
      } else {
        logger.error(`Full error: ${JSON.stringify(error, null, 2)}`);
      }
      // Log additional details if available in error object
      if (error.response && error.response.data) {
          logger.error(`Apify API error details: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return []; // Return empty array on error
    }
  }
}

module.exports = ActorRunner;
