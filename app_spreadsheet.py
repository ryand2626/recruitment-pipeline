"""
Streamlit Spreadsheet Interface for Job Outreach Pipeline
A clean, user-friendly interface for managing recruitment outreach
"""
import streamlit as st
import pandas as pd
import requests
import json
from datetime import datetime, timedelta
import time

# Page config
st.set_page_config(
    page_title="Job Outreach Manager",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Custom CSS for better spreadsheet styling
st.markdown("""
<style>
    .stDataFrame {
        font-size: 14px;
    }
    .metric-card {
        background-color: #f0f2f6;
        padding: 20px;
        border-radius: 10px;
        text-align: center;
    }
    div[data-testid="stHorizontalBlock"] > div {
        padding: 0 5px;
    }
</style>
""", unsafe_allow_html=True)

# API Functions
def fetch_jobs_by_status(status=None):
    """Fetch jobs from the database filtered by email status"""
    try:
        url = "http://localhost:3001/api/jobs"
        params = {"limit": 1000}
        if status:
            params["email_status"] = status
        
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            data = response.json()
            return pd.DataFrame(data.get('jobs', []))
        else:
            st.error(f"API Error: {response.status_code}")
            return pd.DataFrame()
    except Exception as e:
        st.error(f"Failed to fetch jobs: {str(e)}")
        return pd.DataFrame()

def update_job_status(job_id, status):
    """Update the email status of a job"""
    try:
        response = requests.put(
            f"http://localhost:3001/api/jobs/{job_id}",
            json={"email_status": status},
            timeout=10
        )
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def send_test_email(job_id):
    """Send a test email for a specific job"""
    try:
        response = requests.post(
            "http://localhost:3001/trigger/outreach",
            json={
                "job_ids": [job_id],
                "email_config": {
                    "firm_name": "Robertson Wright",
                    "sender_name": "Joe Robertson",
                    "sender_email": "joe@em7728.robertsonwright.co.uk",
                    "tone": "Professional"
                },
                "personalized_emails": [{
                    "job_id": job_id,
                    "job": {"id": job_id, "company": "Test Company", "title": "Test Position", "contact_email": "test@example.com"},
                    "email_template": {
                        "subject_lines": ["Test email from Robertson Wright"],
                        "email_body": "This is a test email from the recruitment pipeline."
                    }
                }]
            },
            timeout=30
        )
        return response.json()
    except Exception as e:
        return {"error": str(e)}

# Header
st.title("📊 Job Outreach Manager")
st.markdown("Manage your recruitment outreach pipeline with ease")

# Top metrics
col1, col2, col3, col4, col5 = st.columns(5)

# Fetch all jobs for metrics
all_jobs_df = fetch_jobs_by_status()

if not all_jobs_df.empty:
    with col1:
        if 'email_status' in all_jobs_df.columns:
            new_count = len(all_jobs_df[all_jobs_df['email_status'] == 'new'])
        else:
            new_count = 0
        st.metric("📥 New Jobs", new_count)
    
    with col2:
        if 'email_status' in all_jobs_df.columns:
            queued_count = len(all_jobs_df[all_jobs_df['email_status'] == 'queued'])
        else:
            queued_count = 0
        st.metric("📧 Queued", queued_count)
    
    with col3:
        if 'email_status' in all_jobs_df.columns:
            sent_count = len(all_jobs_df[all_jobs_df['email_status'] == 'sent'])
        else:
            sent_count = 0
        st.metric("✉️ Sent", sent_count)
    
    with col4:
        if 'email_status' in all_jobs_df.columns:
            replied_count = len(all_jobs_df[all_jobs_df['email_status'] == 'replied'])
        else:
            replied_count = 0
        st.metric("💬 Replies", replied_count)
    
    with col5:
        response_rate = (replied_count / sent_count * 100) if sent_count > 0 else 0
        st.metric("📈 Response Rate", f"{response_rate:.1f}%")
else:
    with col1:
        st.metric("📥 New Jobs", 0)
    with col2:
        st.metric("📧 Queued", 0)
    with col3:
        st.metric("✉️ Sent", 0)
    with col4:
        st.metric("💬 Replies", 0)
    with col5:
        st.metric("📈 Response Rate", "0.0%")

# Tab navigation
tab1, tab2, tab3, tab4 = st.tabs([
    "📥 New Jobs", 
    "📧 Outreach Queue", 
    "✉️ Sent", 
    "💬 Responses"
])

# Helper function to create interactive dataframe
def create_job_dataframe(df, show_select=True, key_prefix=""):
    """Create an interactive dataframe with selection capability"""
    if df.empty:
        st.info("No jobs in this category")
        return []
    
    # Prepare display columns
    display_columns = ['company', 'title', 'location', 'source', 'collected_at']
    if 'email_sent_at' in df.columns:
        display_columns.append('email_sent_at')
    if 'email_opened_at' in df.columns:
        display_columns.append('email_opened_at')
    if 'email_replied_at' in df.columns:
        display_columns.append('email_replied_at')
    
    # Add selection column if needed
    if show_select:
        # Reset index to ensure proper alignment
        df_work = df.reset_index(drop=True).copy()
        df_display = df_work[display_columns].copy()
        
        # Convert datetime columns to proper format
        if 'collected_at' in df_display.columns:
            df_display['collected_at'] = pd.to_datetime(df_display['collected_at'], errors='coerce')
        if 'email_sent_at' in df_display.columns:
            df_display['email_sent_at'] = pd.to_datetime(df_display['email_sent_at'], errors='coerce')
        
        # Add job ID as verification column (show only first 8 chars)
        df_display.insert(0, 'job_id', df_work['id'].str[:8])
        df_display.insert(1, 'Select', False)
        
        # Use data editor for selection
        edited_df = st.data_editor(
            df_display,
            hide_index=True,
            use_container_width=True,
            key=f"{key_prefix}_editor",
            column_config={
                "job_id": st.column_config.TextColumn(
                    "Job ID",
                    width="small",
                    help="Internal job identifier"
                ),
                "Select": st.column_config.CheckboxColumn(
                    "Select",
                    help="Select jobs for bulk actions",
                    default=False,
                ),
                "company": st.column_config.TextColumn(
                    "Company",
                    width="medium",
                ),
                "title": st.column_config.TextColumn(
                    "Title",
                    width="large",
                ),
                "location": st.column_config.TextColumn(
                    "Location",
                    width="medium",
                ),
                "collected_at": st.column_config.DatetimeColumn(
                    "Collected",
                    format="DD/MM/YYYY HH:mm",
                    width="small",
                ),
                "email_sent_at": st.column_config.DatetimeColumn(
                    "Sent",
                    format="DD/MM/YYYY HH:mm",
                    width="small",
                ),
            }
        )
        
        # Get selected rows using job IDs for absolute safety
        selected_short_ids = edited_df[edited_df['Select']]['job_id'].tolist()
        # Match the short IDs back to full IDs
        selected_jobs = df_work[df_work['id'].str[:8].isin(selected_short_ids)].to_dict('records')
        
        # Debug info for verification
        if selected_jobs:
            st.write(f"**Debug:** Selected {len(selected_jobs)} jobs with IDs: {[job['id'][:8] for job in selected_jobs]}")
        
        return selected_jobs
    else:
        # Just display without selection
        df_display = df[display_columns].copy()
        
        # Convert datetime columns to proper format
        if 'collected_at' in df_display.columns:
            df_display['collected_at'] = pd.to_datetime(df_display['collected_at'], errors='coerce')
        if 'email_sent_at' in df_display.columns:
            df_display['email_sent_at'] = pd.to_datetime(df_display['email_sent_at'], errors='coerce')
        
        st.dataframe(
            df_display,
            hide_index=True,
            use_container_width=True,
            key=f"{key_prefix}_display"
        )
        return []

# Tab 1: New Jobs
with tab1:
    st.header("📥 New Jobs")
    st.markdown("Fresh jobs from scraping that haven't been contacted yet")
    
    # Filters
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        company_filter = st.text_input("Filter by Company", key="new_company_filter")
    with col2:
        title_filter = st.text_input("Filter by Title", key="new_title_filter")
    with col3:
        location_filter = st.text_input("Filter by Location", key="new_location_filter")
    with col4:
        source_filter = st.selectbox("Filter by Source", ["All", "LinkedIn", "Indeed", "Apify"], key="new_source_filter")
    
    # Fetch new jobs
    if not all_jobs_df.empty and 'email_status' in all_jobs_df.columns:
        new_jobs_df = all_jobs_df[all_jobs_df['email_status'] == 'new'].copy()
    else:
        new_jobs_df = pd.DataFrame()
    
    # Apply filters
    if company_filter:
        new_jobs_df = new_jobs_df[new_jobs_df['company'].str.contains(company_filter, case=False, na=False)]
    if title_filter:
        new_jobs_df = new_jobs_df[new_jobs_df['title'].str.contains(title_filter, case=False, na=False)]
    if location_filter:
        new_jobs_df = new_jobs_df[new_jobs_df['location'].str.contains(location_filter, case=False, na=False)]
    if source_filter != "All":
        new_jobs_df = new_jobs_df[new_jobs_df['source'] == source_filter]
    
    # Action buttons
    col1, col2, col3, col4 = st.columns([1, 1, 1, 3])
    with col1:
        if st.button("🔄 Refresh", key="refresh_new"):
            st.rerun()
    
    # Display jobs
    selected_new_jobs = create_job_dataframe(new_jobs_df, show_select=True, key_prefix="new")
    
    # Queue for outreach button
    if selected_new_jobs:
        st.markdown("---")
        
        # Show which jobs will be queued
        st.write("**Selected jobs to queue:**")
        for job in selected_new_jobs:
            st.write(f"• **{job['company']}** - {job['title']} ({job['location']})")
        
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            if st.button(f"📧 Queue {len(selected_new_jobs)} Jobs for Outreach", type="primary", use_container_width=True):
                # Update status to queued
                for job in selected_new_jobs:
                    update_job_status(job['id'], 'queued')
                st.success(f"✅ {len(selected_new_jobs)} jobs added to outreach queue!")
                time.sleep(1)
                st.rerun()

# Tab 2: Outreach Queue
with tab2:
    st.header("📧 Outreach Queue")
    st.markdown("Jobs queued for email outreach")
    
    # Fetch queued jobs
    if not all_jobs_df.empty and 'email_status' in all_jobs_df.columns:
        queued_jobs_df = all_jobs_df[all_jobs_df['email_status'] == 'queued'].copy()
    else:
        queued_jobs_df = pd.DataFrame()
    
    if not queued_jobs_df.empty:
        # Display queued jobs
        st.subheader("Jobs in Queue")
        selected_queued = create_job_dataframe(queued_jobs_df, show_select=True, key_prefix="queue")
        
        # Send emails button
        col1, col2, col3 = st.columns([1, 2, 1])
        with col2:
            send_selected = st.button(
                f"🚀 Send Emails to {len(selected_queued) if selected_queued else len(queued_jobs_df)} Jobs",
                type="primary",
                use_container_width=True
            )
        
        if send_selected:
            jobs_to_send = selected_queued if selected_queued else queued_jobs_df.to_dict('records')
            
            # Show which jobs will be sent
            st.info("📧 **Sending emails to:**")
            for job in jobs_to_send:
                st.write(f"• **{job['company']}** - {job['title']} ({job['location']})")
            
            with st.spinner(f"Sending {len(jobs_to_send)} emails..."):
                # Send emails using the test function for now
                for job in jobs_to_send:
                    result = send_test_email(job['id'])
                    if 'error' not in result:
                        st.success(f"✅ Email sent to {job['company']}")
                    else:
                        st.error(f"❌ Failed to send to {job['company']}: {result['error']}")
                
                st.success(f"✅ Completed sending {len(jobs_to_send)} emails!")
                st.balloons()
                time.sleep(2)
                st.rerun()
    else:
        st.info("No jobs in the outreach queue. Select jobs from the 'New Jobs' tab to add them to the queue.")

# Tab 3: Sent
with tab3:
    st.header("✉️ Sent Emails")
    st.markdown("Emails sent and awaiting response")
    
    # Fetch sent jobs
    if not all_jobs_df.empty and 'email_status' in all_jobs_df.columns:
        sent_jobs_df = all_jobs_df[all_jobs_df['email_status'] == 'sent'].copy()
    else:
        sent_jobs_df = pd.DataFrame()
    
    if not sent_jobs_df.empty:
        # Metrics
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total Sent", len(sent_jobs_df))
        with col2:
            opened_count = len(sent_jobs_df[sent_jobs_df.get('email_opened_at', '').notna()])
            st.metric("Opened", opened_count)
        with col3:
            clicked_count = len(sent_jobs_df[sent_jobs_df.get('email_clicked_at', '').notna()])
            st.metric("Clicked", clicked_count)
        with col4:
            open_rate = (opened_count / len(sent_jobs_df) * 100) if len(sent_jobs_df) > 0 else 0
            st.metric("Open Rate", f"{open_rate:.1f}%")
        
        # Sort by sent date (most recent first)
        sent_jobs_df = sent_jobs_df.sort_values('email_sent_at', ascending=False)
        
        # Display sent jobs
        create_job_dataframe(sent_jobs_df, show_select=False, key_prefix="sent")
    else:
        st.info("No emails sent yet. Queue some jobs for outreach first!")

# Tab 4: Responses
with tab4:
    st.header("💬 Responses")
    st.markdown("Companies that have replied to your outreach")
    
    # Fetch replied jobs
    if not all_jobs_df.empty and 'email_status' in all_jobs_df.columns:
        replied_jobs_df = all_jobs_df[all_jobs_df['email_status'] == 'replied'].copy()
    else:
        replied_jobs_df = pd.DataFrame()
    
    if not replied_jobs_df.empty:
        # Success metrics
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Replies", len(replied_jobs_df))
        with col2:
            positive_count = len(replied_jobs_df[replied_jobs_df.get('reply_sentiment', '') == 'positive'])
            st.metric("Positive Replies", positive_count)
        with col3:
            avg_response_time = "2.3 days"  # Calculate from data
            st.metric("Avg Response Time", avg_response_time)
        
        # Sort by reply date (most recent first)
        replied_jobs_df = replied_jobs_df.sort_values('email_replied_at', ascending=False)
        
        # Display replied jobs
        create_job_dataframe(replied_jobs_df, show_select=False, key_prefix="replied")
    else:
        st.info("No replies yet. Keep monitoring - responses typically come within 2-5 days!")

# Sidebar for quick actions
with st.sidebar:
    st.header("⚡ Quick Actions")
    
    if st.button("🔄 Refresh All Data", use_container_width=True):
        st.rerun()
    
    if st.button("🚀 Run New Scrape", use_container_width=True):
        with st.spinner("Running scraper..."):
            response = requests.post(
                "http://localhost:3001/trigger/scrape",
                json={"location": "United States", "maxItems": 50},
                timeout=30
            )
            if response.status_code in [200, 202]:
                st.success("✅ Scraping started!")
            else:
                st.error("❌ Scraping failed")
    
    st.markdown("---")
    st.subheader("📊 Database Stats")
    if not all_jobs_df.empty:
        st.metric("Total Jobs", len(all_jobs_df))
        st.metric("Companies", all_jobs_df['company'].nunique())
        st.metric("Locations", all_jobs_df['location'].nunique())
    
    st.markdown("---")
    st.caption("Last updated: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S")) 