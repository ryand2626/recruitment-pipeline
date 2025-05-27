const { ApifyClient } = require('apify-client');

class ActorRunner {
  constructor(apifyToken, loggerInstance) {
    if (!apifyToken) {
      throw new Error('ActorRunner constructor: apifyToken is required');
    }
    if (!loggerInstance) {
      throw new Error('ActorRunner constructor: loggerInstance is required');
    }
    this.apifyClient = new ApifyClient({ token: apifyToken });
    this.logger = loggerInstance; // Use this.logger
  }

  /**
   * Runs an Apify actor and retrieves its results.
   * @param {string} actorName - The name or ID of the Apify actor (e.g., "username/actor-name").
   * @param {object} inputObject - The input object for the actor.
   * @returns {Promise<Array>} A promise that resolves to an array of items from the actor's dataset.
   *                           Returns an empty array if the run fails or yields no items.
   */
  async run(actorName, inputObject) {
    this.logger.info(`Starting Apify actor: ${actorName} with input: ${JSON.stringify(inputObject, null, 2)}`);

    let run;
    try {
      // Start the actor
      run = await this.apifyClient.actor(actorName).start(inputObject, { waitForFinish: 2 * 60 }); // Wait for 2 minutes for the run to start and potentially finish
      
      this.logger.info(`Apify actor ${actorName} started. Run ID: ${run.id}, Status: ${run.status}`);

      // Wait for the run to finish
      // The 'waitForFinish' option in start() might make this redundant if it waits for full completion.
      // However, ApifyClient's start() with waitForFinish might only wait for the run to be *created* and *started*, not necessarily *finished*.
      // Explicitly waiting for finish is safer.
      // ApifyClient.waitForFinish returns the run object once it's finished.
      this.logger.info(`Waiting for Apify actor ${actorName} (Run ID: ${run.id}) to finish...`);
      const finishedRun = await this.apifyClient.run(run.id).waitForFinish();

      this.logger.info(`Apify actor ${actorName} (Run ID: ${run.id}) finished with status: ${finishedRun.status}`);

      if (finishedRun.status !== 'SUCCEEDED') {
        this.logger.error(`Apify actor ${actorName} (Run ID: ${run.id}) did not succeed. Status: ${finishedRun.status}. Full run details: ${JSON.stringify(finishedRun, null, 2)}`);
        // Attempt to get error details if available (structure might vary)
        if (finishedRun.output && finishedRun.output.contentType === 'application/json') {
            const errorDetails = await this.apifyClient.keyValueStore(finishedRun.defaultKeyValueStoreId).getRecord('OUTPUT');
            this.logger.error(`Error details for run ${run.id}: ${JSON.stringify(errorDetails.value, null, 2)}`);
        }
        return []; // Return empty array on failure
      }

      // Fetch the results from the default dataset
      this.logger.info(`Fetching results for Apify actor ${actorName} (Run ID: ${run.id}, Dataset ID: ${finishedRun.defaultDatasetId})...`);
      const { items } = await this.apifyClient.dataset(finishedRun.defaultDatasetId).listItems();

      if (!items || items.length === 0) {
        this.logger.warn(`Apify actor ${actorName} (Run ID: ${run.id}) completed successfully but returned no items.`);
        return [];
      }

      this.logger.info(`Apify actor ${actorName} (Run ID: ${run.id}) returned ${items.length} items.`);
      return items;

    } catch (error) {
      this.logger.error(`Error running Apify actor ${actorName}: ${error.message}`);
      if (run && run.id) {
        this.logger.error(`Error occurred for Run ID: ${run.id}. Full error: ${JSON.stringify(error, null, 2)}`);
      } else {
        this.logger.error(`Full error: ${JSON.stringify(error, null, 2)}`);
      }
      // Log additional details if available in error object
      if (error.response && error.response.data) {
          this.logger.error(`Apify API error details: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return []; // Return empty array on error
    }
  }
}

module.exports = ActorRunner;
