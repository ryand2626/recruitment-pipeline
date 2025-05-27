"""
Streamlit User Interface for the Data Processing Pipeline

Purpose:
This script provides an interactive browser-based UI for configuring,
running, and monitoring the data-processing pipeline. It allows users
to specify inputs such as source text, target job titles, confidence
thresholds, processing modes, and detailed Apify actor configurations.

Features:
- Intuitive widgets for all configurable pipeline parameters.
- Manual pipeline execution via a 'Run Pipeline' button.
- Optional 'Auto-run on change' for immediate feedback on parameter tweaks.
- In-line display of pipeline results including JSON, tables, and logs.
- A `run_pipeline` function stub designed for easy integration with the
  actual backend pipeline logic.

To Run:
Ensure Streamlit is installed (`pip install streamlit`).
Execute the following command in your terminal, in the root directory
of this project:
streamlit run app.py

The UI will automatically open in your default web browser, typically at
http://localhost:8501.
"""
import streamlit as st
import json
import time

# Ensure run_pipeline is defined or imported.
# For this task, it's in the same file.

def run_pipeline(params: dict) -> dict:
    """
    Runs the data processing pipeline with the given parameters.
    This function is the **primary integration point** for the actual production pipeline.
    It receives parameters from the Streamlit UI, orchestrates calls to backend services
    (e.g., Apify actors, custom scraping/enrichment/outreach APIs), and then
    formats the results into a dictionary structure expected by the UI.

    Args:
        params (dict): A dictionary of parameters for the pipeline, collected from the UI.
                       The expected structure is:
                       # params = {
                       #     "source_text": "Example source text for processing.",
                       #     "target_job_titles": ["M&A Analyst", "Investment Banking Associate"],
                       #     "confidence_threshold": 0.75,
                       #     "processing_mode": "Balanced",
                       #     "selected_actors_configs": [
                       #         {
                       #             "actorId": "apify/google-search-scraper",
                       #             "inputs": {
                       #                 "queries": "site:linkedin.com/in/ M&A Analyst finance",
                       #                 "maxPagesPerQuery": 2
                       #             }
                       #         }
                       #     ],
                       #     "pipeline_stages": ["scrape", "enrich"],
                       #     "use_apify": True, # Derived from actor selection
                       #     "scraping_settings": {"concurrentRequests": 5, "requestDelay": 1000}, # Example
                       #     "email_settings": {"fromEmail": "test@example.com"}, # Example
                       #     "runtime_apify_overrides": {} # Example
                       # }
    Returns:
        dict: A dictionary containing the results of the pipeline run, with keys:
              "status" (str): "success" or "error".
              "message" (str): A user-friendly message about the outcome.
              "output_json" (dict/list): JSON-serializable output from the pipeline.
              "output_table" (list of dicts): Data suitable for display in a table.
              "logs" (str): Accumulated logs from the pipeline execution.
    """
    # --- START PRODUCTION PIPELINE INTEGRATION ---
    # TODO: Replace the mock logic below with your actual pipeline implementation.
    # This function is called by the Streamlit UI's `execute_pipeline_flow` function
    # with user-selected parameters.

    print(f"run_pipeline called with params: {json.dumps(params, indent=2)}") # Keep for debugging

    # The 'params' dictionary contains all UI inputs. Its structure is documented above.
    # Example: Accessing parameters
    # source_text = params.get("source_text")
    # target_job_titles = params.get("target_job_titles", [])
    # confidence_threshold = params.get("confidence_threshold")
    # processing_mode = params.get("processing_mode")
    # actor_configs = params.get("selected_actors_configs", [])
    # stages_to_run = params.get("pipeline_stages", []) # e.g., ["scrape", "enrich", "outreach"]
    # use_apify_flag = params.get("use_apify", False)

    # Placeholder for actual logs, status, and results
    actual_logs = "Pipeline run initiated by run_pipeline function.\n"
    pipeline_status = "success" 
    pipeline_message = "Pipeline process initiated."
    actual_output_json = {}
    actual_output_table = []

    # TODO: Based on 'stages_to_run' and other params, make appropriate API calls
    # to your backend services or trigger Apify actors.
    # Example workflow:
    # if "scrape" in stages_to_run:
    #     actual_logs += "Executing scraping stage...\n"
    #     # if use_apify_flag and actor_configs:
    #     #     for actor_config in actor_configs:
    #     #         # E.g., call Apify API: response = call_apify_actor(actor_config["actorId"], actor_config["inputs"])
    #     #         # actual_logs += f"Called actor {actor_config['actorId']}. Response: {response}\n"
    #     #         # Process response, update actual_output_json, actual_output_table
    #     # else:
    #     #     # E.g., call custom scraping service: response = call_custom_scrape_api(params)
    #     #     # actual_logs += f"Called custom scrape API. Response: {response}\n"
    #     #     pass # Replace with actual call
    #     actual_logs += "Scraping stage mock completed.\n"
    #
    # if "enrich" in stages_to_run:
    #     actual_logs += "Executing enrichment stage...\n"
    #     # E.g., call enrichment service: response = call_enrichment_api(params_for_enrichment, scraped_data)
    #     # actual_logs += f"Called enrichment API. Response: {response}\n"
    #     # Process response
    #     actual_logs += "Enrichment stage mock completed.\n"
    #
    # if "outreach" in stages_to_run:
    #     actual_logs += "Executing outreach stage...\n"
    #     # E.g., call outreach service: response = call_outreach_api(params_for_outreach, enriched_data)
    #     # actual_logs += f"Called outreach API. Response: {response}\n"
    #     # Process response
    #     actual_logs += "Outreach stage mock completed.\n"

    # TODO: Error Handling: If any stage fails, set pipeline_status to "error",
    # append error details to actual_logs, and set an appropriate pipeline_message.
    # try:
    #    # ... pipeline logic ...
    # except Exception as e:
    #    pipeline_status = "error"
    #    pipeline_message = f"An error occurred: {str(e)}"
    #    actual_logs += f"ERROR: {str(e)}\n"
    #    # Potentially return partial results if applicable

    # TODO: Collect results, logs, and status from your actual pipeline execution.
    # The returned dictionary should match the structure expected by the UI.
    # Assign actual data to:
    # actual_output_json = {"real_data": "some value", "more_data": [1,2,3]}
    # actual_output_table = [{"column1": "valueA", "column2": 100}, {"column1": "valueB", "column2": 200}]
    
    # Mock logic (current behavior):
    time.sleep(2) # Simulate work being done
    actual_logs += "Mock processing step 1...\n"
    actual_logs += "Mock processing step 2...\n"
    pipeline_message = "Mock pipeline run completed successfully!"
    actual_output_json = {"key": "value", "number": 123, "nested": {"data": "some_data"}}
    actual_output_table = [{"colA": "row1_valA", "colB": "row1_valB"}, {"colA": "row2_valA", "colB": "row2_valB"}]
    actual_logs += "Mock pipeline finished."
    # --- END PRODUCTION PIPELINE INTEGRATION ---

    # Return actual results in the expected format
    return {
        "status": pipeline_status,
        "message": pipeline_message,
        "output_json": actual_output_json,
        "output_table": actual_output_table,
        "logs": actual_logs
    }

# App Title
st.title('Data Processing Pipeline UI')

# Sidebar for global controls
st.sidebar.title("Controls")
auto_run = st.sidebar.checkbox('Auto-run on change', value=False)
run_button_pressed = st.sidebar.button('Run Pipeline')

# Source Text
st.header('Source Text')
source_text = st.text_area('Enter source text here:', 'Default source text example.', key="source_text_input")

# Job Titles
st.header('Target Job Titles')
default_job_titles = [
    'M&A Associate', 'M&A Analyst', 'Vice President M&A', 'M&A Director',
    'Managing Director - Investment Banking', 'Director - Investment Banking',
    'Investment Banking Analyst', 'Investment Banking Associate',
    'Vice President - Investment Banking', 'Corporate Finance'
]
target_job_titles = st.multiselect('Select job titles:', default_job_titles, default=default_job_titles[:2], key="target_job_titles_input")

# Configuration
st.header('Configuration')
confidence_threshold = st.slider('Confidence Threshold:', min_value=0.0, max_value=1.0, value=0.75, step=0.05, key="confidence_threshold_input")
processing_mode = st.radio('Processing Mode:', ['Fast', 'Balanced', 'Thorough'], index=1, key="processing_mode_input")

# Apify Actors Configuration
st.header('Apify Actor Configuration')
available_actors = [
    {
        "actorId": "apify/google-search-scraper",
        "name": "Google Search Scraper",
        "defaultInput": {
            "queries": "site:linkedin.com/in/ OR site:linkedin.com/pub/ \"{title}\" \"{company}\" \"{location}\"",
            "maxPagesPerQuery": 1,
            "resultsPerPage": 10,
            "countryCode": "US"
        }
    },
    {
        "actorId": "another/example-actor",
        "name": "Example LinkedIn Profile Scraper",
        "defaultInput": {
            "fields": ["fullName", "location", "experiences"], 
            "maxProfiles": 10
        }
    }
]

selected_actors_configs_ui = {}
for actor_idx, actor in enumerate(available_actors):
    # Use a more robust key for the checkbox that includes index or a unique part of actorId
    enable_key = f"actor_enable_{actor['actorId'].replace('/', '_')}_{actor_idx}"
    if st.checkbox(f"Enable {actor['name']}", value=True, key=enable_key):
        st.subheader(f"Configure {actor['name']}")
        current_actor_inputs = {}
        for input_key, default_value in actor['defaultInput'].items():
            # Ensure unique keys for actor input fields
            widget_key = f"{actor['actorId'].replace('/', '_')}_{input_key}_{actor_idx}"
            if isinstance(default_value, str):
                current_actor_inputs[input_key] = st.text_input(input_key, default_value, key=widget_key)
            elif isinstance(default_value, (int, float)):
                current_actor_inputs[input_key] = st.number_input(input_key, value=default_value, key=widget_key)
            elif isinstance(default_value, list): # Handle list as JSON string in text_area
                 current_actor_inputs[input_key] = st.text_area(f"{input_key} (JSON format for list)", json.dumps(default_value), key=widget_key)
            else: # For other dicts, etc., represent as JSON string in a text_area
                current_actor_inputs[input_key] = st.text_area(f"{input_key} (JSON format)", json.dumps(default_value), key=widget_key)
        selected_actors_configs_ui[actor['actorId']] = {"actorId": actor['actorId'], "inputs": current_actor_inputs}


# Pipeline Stages
st.header('Pipeline Execution Control')
pipeline_stages_options = ["scrape", "enrich", "outreach"]
selected_pipeline_stages = st.multiselect('Select pipeline stages to run:', pipeline_stages_options, default=["scrape", "enrich"], key="pipeline_stages_input")


def execute_pipeline_flow():
    """Gathers parameters from UI, calls the pipeline, and displays results."""
    
    # Prepare Parameters
    processed_actor_configs = []
    for actor_id, config_data in selected_actors_configs_ui.items():
        parsed_inputs = {}
        for k, v in config_data.get("inputs", {}).items():
            try:
                if isinstance(v, str) and (v.strip().startswith('{') or v.strip().startswith('[')):
                    parsed_inputs[k] = json.loads(v)
                else:
                    parsed_inputs[k] = v
            except json.JSONDecodeError:
                st.error(f"Invalid JSON for input '{k}' in actor '{actor_id}'. Please correct it or it will be passed as a raw string.")
                parsed_inputs[k] = v # Pass raw string if JSON is invalid
        processed_actor_configs.append({
            "actorId": actor_id,
            "inputs": parsed_inputs
        })

    params = {
        "source_text": source_text,
        "target_job_titles": target_job_titles,
        "confidence_threshold": confidence_threshold,
        "processing_mode": processing_mode,
        "selected_actors_configs": processed_actor_configs,
        "pipeline_stages": selected_pipeline_stages,
        "use_apify": bool(processed_actor_configs), # True if any actor is configured
        "scraping_settings": {"concurrentRequests": 5, "requestDelay": 1000}, # Placeholder
        "email_settings": {"fromEmail": "test@example.com"}, # Placeholder
        "runtime_apify_overrides": {} # Placeholder
    }

    with st.spinner('Pipeline is running...'):
        results = run_pipeline(params)

    if results.get("status") == "success":
        st.success(results.get("message", "Pipeline run finished."))
    else:
        st.error(results.get("message", "Pipeline run failed or completed with errors."))

    if "output_json" in results:
        st.subheader('JSON Output:')
        try:
            st.json(results["output_json"])
        except Exception as e:
            st.error(f"Failed to display JSON output: {e}")
            st.text(results["output_json"]) # show as text if not valid json for st.json

    if "output_table" in results:
        st.subheader('Table Output:')
        try:
            st.dataframe(results["output_table"])
        except Exception as e:
            st.error(f"Failed to display table output: {e}")
            st.text(str(results["output_table"]))


    if "logs" in results:
        st.subheader('Logs:')
        st.text_area("Pipeline Logs", results["logs"], height=200)

# Triggering Execution
if auto_run:
    st.sidebar.markdown("Auto-run is ON. Pipeline will run on any change.")
    execute_pipeline_flow()
elif run_button_pressed:
    execute_pipeline_flow()
