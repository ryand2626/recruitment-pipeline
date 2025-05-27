"""
Streamlit User Interface for the Job Opportunity Pipeline

Purpose:
This pipeline finds job postings and sends personalized outreach emails
to companies/hiring managers offering recruitment services.

Workflow:
1. AI generates source text based on niche (investment banking, M&A, etc.)
2. Select target job titles and expand with synonyms
3. Select US states for geographic targeting
4. Configure confidence and processing settings
5. Run pipeline to find all matching job postings
6. Display results with company/contact information
7. Select jobs (all or individual) for outreach
8. AI generates and sends personalized emails to maximize response rates
"""
import streamlit as st
import json
import time
import pandas as pd

def generate_source_text_options(topic):
    """
    AI-powered function to generate source text options based on a topic.
    These texts help the pipeline understand what types of jobs to look for.
    """
    topic_lower = topic.lower()
    
    if "investment banking" in topic_lower or "ib" in topic_lower:
        return {
            "Investment Banking Hiring Surge": """Investment banks are aggressively hiring across all levels. Goldman Sachs, JP Morgan, and Morgan Stanley lead the charge with expanded M&A teams. Focus on technology, healthcare, and energy sectors. Compensation packages at record highs with $200K+ for analysts.""",
            
            "Boutique IB Growth Market": """Middle-market investment banks experiencing unprecedented growth. Firms like Evercore, Lazard, and Moelis expanding rapidly. Seeking experienced professionals for sector-focused teams. Deal flow increasing 40% year-over-year.""",
            
            "Regional IB Expansion": """Regional investment banks building presence outside NYC. Chicago, San Francisco, Dallas, and Miami seeing significant IB growth. Firms establishing new offices and hiring local talent. Focus on middle-market transactions.""",
            
            "IB Technology Transformation": """Investment banks investing heavily in technology talent. Seeking professionals with both finance and tech backgrounds. AI, blockchain, and automation driving new hiring needs. Traditional IB roles evolving with tech requirements.""",
            
            "Post-Pandemic IB Hiring": """Investment banking hiring rebounds strongly post-pandemic. Remote work options expanding talent pool. Work-life balance improvements attracting new talent. Diversity initiatives driving inclusive hiring practices."""
        }
    
    elif "m&a" in topic_lower or "mergers" in topic_lower:
        return {
            "M&A Advisory Demand Surge": """M&A advisory services in high demand across all sectors. Companies seeking experienced deal professionals for complex transactions. Cross-border expertise particularly valuable. Deal sizes ranging from $50M to multi-billion.""",
            
            "Tech M&A Specialist Need": """Technology M&A reaching record levels with AI driving consolidation. Companies need advisors who understand SaaS, AI/ML, and cybersecurity. Valuations complex, requiring specialized expertise. Deal premiums averaging 40% above market.""",
            
            "Healthcare M&A Expansion": """Healthcare M&A activity accelerating with biotech consolidation. Pharma companies acquiring innovative startups. Medical device sector seeing roll-up strategies. Regulatory expertise critical for successful deals.""",
            
            "Private Equity M&A Growth": """Private equity firms driving M&A activity with record dry powder. Platform acquisitions and add-ons creating advisor opportunities. Operational improvement focus requiring hands-on expertise. Portfolio company exits generating fees.""",
            
            "Middle Market M&A Boom": """Middle market M&A thriving with $10M-$500M deals proliferating. Family businesses seeking succession planning advisors. Strategic buyers competing with financial sponsors. Regional expertise valuable for local deals."""
        }
    
    else:  # General finance
        return {
            "Financial Services Hiring Wave": """Financial services sector experiencing broad-based hiring surge. Investment banks, private equity, and hedge funds all expanding. Technology transformation creating new role categories. Compensation reaching new highs across all levels.""",
            
            "Alternative Investment Growth": """Alternative investment firms building teams aggressively. Private equity, hedge funds, and family offices competing for talent. Focus on operational expertise and value creation. Carry participation becoming standard.""",
            
            "Fintech Disruption Hiring": """Fintech companies hiring finance professionals from traditional firms. Blockchain, digital assets, and DeFi creating new opportunities. Startup equity packages competing with bank bonuses. Innovation mindset required.""",
            
            "ESG Finance Expansion": """ESG and sustainable finance driving new hiring needs. Impact investing and green finance teams expanding. Traditional firms building dedicated ESG practices. Measurement and reporting expertise valuable.""",
            
            "Regional Finance Growth": """Financial hubs beyond NYC/SF seeing significant growth. Miami, Austin, Nashville emerging as finance centers. Cost of living advantages attracting firms and talent. Remote work enabling geographic expansion."""
        }

def generate_job_title_synonyms(job_titles):
    """
    Generates synonyms and variations for job titles to maximize search coverage.
    """
    synonym_mapping = {
        # M&A Titles
        "M&A Associate": [
            "Mergers & Acquisitions Associate", "M and A Associate", "MA Associate",
            "Corporate Development Associate", "Strategic Finance Associate",
            "Investment Banking Associate - M&A", "Deal Associate", "Transaction Associate",
            "Corp Dev Associate", "Strategic Transactions Associate"
        ],
        "M&A Analyst": [
            "Mergers & Acquisitions Analyst", "M and A Analyst", "MA Analyst",
            "Corporate Development Analyst", "Strategic Finance Analyst",
            "Investment Banking Analyst - M&A", "Deal Analyst", "Transaction Analyst",
            "M&A Advisory Analyst", "Mergers Analyst"
        ],
        "Vice President M&A": [
            "VP M&A", "Vice President Mergers & Acquisitions", "VP Mergers and Acquisitions",
            "M&A Vice President", "Corporate Development VP", "Strategic Finance VP",
            "VP - M&A", "Vice President - Mergers & Acquisitions", "SVP M&A"
        ],
        "M&A Director": [
            "Director M&A", "Director Mergers & Acquisitions", "M&A Managing Director",
            "Corporate Development Director", "Strategic Finance Director",
            "Director - M&A", "Senior Director M&A", "Executive Director M&A"
        ],
        
        # Investment Banking Titles
        "Investment Banking Analyst": [
            "IB Analyst", "IBD Analyst", "Investment Bank Analyst", "Corporate Finance Analyst",
            "Capital Markets Analyst", "Financial Analyst - Investment Banking",
            "Analyst - Investment Banking", "Junior Investment Banker", "Banking Analyst"
        ],
        "Investment Banking Associate": [
            "IB Associate", "IBD Associate", "Investment Bank Associate", "Corporate Finance Associate",
            "Capital Markets Associate", "Associate - Investment Banking",
            "Senior Investment Banking Analyst", "Investment Banker", "Banking Associate"
        ],
        "Vice President - Investment Banking": [
            "VP Investment Banking", "Investment Banking VP", "IB VP", "IBD VP",
            "Vice President - IB", "VP - Investment Banking", "Senior Vice President IB",
            "Principal - Investment Banking", "Investment Banking Vice President"
        ],
        "Managing Director - Investment Banking": [
            "MD Investment Banking", "Investment Banking MD", "IB MD", "IBD MD",
            "Managing Director - IB", "MD - Investment Banking", "Senior Managing Director",
            "Executive Director - Investment Banking", "Partner - Investment Banking"
        ]
    }
    
    expanded_titles = set(job_titles)
    
    for title in job_titles:
        # Direct synonym lookup
        if title in synonym_mapping:
            expanded_titles.update(synonym_mapping[title])
        
        # Pattern-based expansion
        title_lower = title.lower()
        
        # M&A variations
        if "m&a" in title_lower:
            expanded_titles.add(title.replace("M&A", "Mergers & Acquisitions"))
            expanded_titles.add(title.replace("M&A", "Mergers and Acquisitions"))
            expanded_titles.add(title.replace("M&A", "MA"))
            expanded_titles.add(title.replace("M&A", "M and A"))
        
        # Investment Banking variations
        if "investment banking" in title_lower:
            expanded_titles.add(title.replace("Investment Banking", "IB"))
            expanded_titles.add(title.replace("Investment Banking", "IBD"))
            expanded_titles.add(title.replace("Investment Banking", "Corporate Finance"))
            expanded_titles.add(title.replace("Investment Banking", "Banking"))
    
    return sorted(list(expanded_titles))

def generate_email_templates(job_data, recruitment_firm_info):
    """
    Generates personalized email templates for each job opportunity.
    Focuses on creating compelling subject lines and personalized content.
    """
    templates = []
    
    for job in job_data:
        company = job.get('company', 'Company')
        title = job.get('title', 'Position')
        location = job.get('location', 'Location')
        
        # Generate multiple subject line options (A/B testing)
        subject_lines = [
            f"Top {title} candidates ready to interview - {company}",
            f"Re: Your {title} opening - 3 qualified candidates available",
            f"{company}'s {title} search - we have your shortlist ready",
            f"Proven {title} talent for {company} - immediate availability",
            f"Quick question about your {title} role"
        ]
        
        # Personalized email body
        email_body = f"""Hi [Hiring Manager Name],

I noticed {company} is looking for a {title} in {location}. 

We've successfully placed similar roles at [Similar Company 1] and [Similar Company 2], typically filling positions within 3-4 weeks with candidates who stay 3+ years.

I have 3 pre-screened {title} candidates who:
• Have the exact experience you're looking for
• Are actively interviewing and will move quickly
• Are specifically interested in {company}'s [specific aspect - culture/growth/mission]

Would you be open to a brief 10-minute call this week to discuss? I can share candidate profiles immediately if helpful.

Best regards,
[Your Name]
[Your Title]
[Recruitment Firm]
[Phone] | [Email]

P.S. If you're not the right person for this, could you please point me to the hiring manager? Thanks!
"""
        
        templates.append({
            'job_id': job.get('id'),
            'company': company,
            'position': title,
            'subject_lines': subject_lines,
            'email_body': email_body,
            'contact_email': job.get('contact_email', ''),
            'personalization_notes': job.get('company_insights', '')
        })
    
    return templates

def run_pipeline(params: dict) -> dict:
    """
    Runs the job finding pipeline with the given parameters.
    Returns job postings that match the criteria.
    """
    print(f"run_pipeline called with params: {json.dumps(params, indent=2)}")
    
    # Simulate pipeline execution
    time.sleep(2)
    
    # Mock job posting results
    mock_jobs = [
        {
            'id': 'job_001',
            'company': 'Goldman Sachs',
            'title': 'M&A Associate',
            'location': 'New York, NY',
            'posted_date': '2024-01-15',
            'salary_range': '$225,000 - $275,000',
            'contact_email': 'recruiting@goldmansachs.com',
            'job_url': 'https://goldmansachs.com/careers/job-123',
            'description': 'Seeking M&A Associate for Technology coverage group...',
            'company_insights': 'Recently announced expansion of tech M&A team'
        },
        {
            'id': 'job_002',
            'company': 'Evercore',
            'title': 'Vice President - M&A',
            'location': 'San Francisco, CA',
            'posted_date': '2024-01-14',
            'salary_range': '$350,000 - $450,000',
            'contact_email': 'careers@evercore.com',
            'job_url': 'https://evercore.com/careers/job-456',
            'description': 'VP role in growing Healthcare M&A practice...',
            'company_insights': 'Opened SF office last year, growing rapidly'
        },
        {
            'id': 'job_003',
            'company': 'Lazard',
            'title': 'Investment Banking Analyst',
            'location': 'Chicago, IL',
            'posted_date': '2024-01-13',
            'salary_range': '$175,000 - $200,000',
            'contact_email': 'ib-recruiting@lazard.com',
            'job_url': 'https://lazard.com/careers/job-789',
            'description': 'Analyst position in Restructuring group...',
            'company_insights': 'Leading restructuring practice, busy with current market'
        }
    ]
    
    return {
        "status": "success",
        "message": f"Found {len(mock_jobs)} matching job postings",
        "jobs": mock_jobs,
        "total_matches": len(mock_jobs),
        "logs": "Pipeline executed successfully. Jobs scraped from LinkedIn, Indeed, company websites."
    }

# Initialize session state
if 'selected_jobs_for_outreach' not in st.session_state:
    st.session_state.selected_jobs_for_outreach = []

# App Title
st.title('🎯 Investment Banking Job Outreach Pipeline')
st.markdown("*Find job postings and send personalized recruitment service emails*")

# Sidebar for global controls
st.sidebar.title("🎛️ Controls")
run_button_pressed = st.sidebar.button('🚀 Run Pipeline', type="primary")

# Step 1: AI-Powered Source Text Generation
st.header('Step 1: 🤖 Define Your Niche')
st.markdown("Enter your recruitment focus area to generate targeted search parameters")

col1, col2 = st.columns([3, 1])

with col1:
    topic_input = st.text_input(
        "Enter your niche:",
        placeholder="e.g., investment banking, M&A, private equity",
        help="This helps the AI understand what types of jobs to search for"
    )

with col2:
    generate_button = st.button("🎯 Generate", type="secondary")

# Initialize source_text variable
source_text = ""

# Generate source text options based on topic
if generate_button and topic_input:
    with st.spinner(f"🔍 Generating search parameters for '{topic_input}'..."):
        time.sleep(1)
        generated_options = generate_source_text_options(topic_input)
        st.session_state['generated_options'] = generated_options
        st.session_state['current_topic'] = topic_input

# Display generated options
if 'generated_options' in st.session_state:
    selected_generated = st.selectbox(
        "Choose search context:",
        options=list(st.session_state['generated_options'].keys()),
        key="generated_source_select"
    )
    
    if selected_generated:
        source_text = st.session_state['generated_options'][selected_generated]
        st.success(f"✅ Search context set: '{selected_generated}'")

# Step 2: Job Titles with Synonym Expansion
st.header('Step 2: 🎯 Target Job Titles')

default_job_titles = [
    'M&A Associate', 'M&A Analyst', 'Vice President M&A', 'M&A Director',
    'Managing Director - Investment Banking', 'Director - Investment Banking',
    'Investment Banking Analyst', 'Investment Banking Associate',
    'Vice President - Investment Banking'
]

target_job_titles = st.multiselect(
    'Select job titles to search for:', 
    default_job_titles, 
    default=default_job_titles[:2], 
    key="target_job_titles_input"
)

# Synonym Expansion
if target_job_titles:
    col1, col2 = st.columns([3, 1])
    
    with col2:
        find_synonyms_button = st.button("🔍 Find Synonyms", type="secondary")
    
    if find_synonyms_button:
        with st.spinner("Finding job title variations..."):
            time.sleep(1)
            expanded_titles = generate_job_title_synonyms(target_job_titles)
            st.session_state['expanded_job_titles'] = expanded_titles
            st.session_state['original_job_titles'] = target_job_titles
    
    if 'expanded_job_titles' in st.session_state:
        original_count = len(st.session_state.get('original_job_titles', []))
        expanded_count = len(st.session_state['expanded_job_titles'])
        new_synonyms = expanded_count - original_count
        
        st.success(f"✅ Found {new_synonyms} additional variations! Total: {expanded_count} job titles")
        
        use_expanded = st.checkbox(
            f"Use expanded list ({expanded_count} titles) for comprehensive search",
            value=True
        )
        
        final_job_titles = st.session_state['expanded_job_titles'] if use_expanded else target_job_titles
    else:
        final_job_titles = target_job_titles
else:
    final_job_titles = []

# Step 3: Geographic Targeting
st.header('Step 3: 🗺️ Geographic Targeting')

us_states = {
    "All States": "nationwide",
    "New York": "NY",
    "California": "CA", 
    "Texas": "TX",
    "Florida": "FL",
    "Illinois": "IL",
    "Pennsylvania": "PA",
    "Ohio": "OH",
    "Georgia": "GA",
    "North Carolina": "NC",
    "Michigan": "MI",
    "New Jersey": "NJ",
    "Virginia": "VA",
    "Washington": "WA",
    "Arizona": "AZ",
    "Massachusetts": "MA",
    "Tennessee": "TN",
    "Indiana": "IN",
    "Maryland": "MD",
    "Missouri": "MO",
    "Wisconsin": "WI",
    "Colorado": "CO",
    "Minnesota": "MN",
    "South Carolina": "SC",
    "Alabama": "AL",
    "Louisiana": "LA",
    "Kentucky": "KY",
    "Oregon": "OR",
    "Oklahoma": "OK",
    "Connecticut": "CT",
    "Utah": "UT",
    "Iowa": "IA",
    "Nevada": "NV",
    "Arkansas": "AR",
    "Mississippi": "MS",
    "Kansas": "KS",
    "New Mexico": "NM",
    "Nebraska": "NE",
    "West Virginia": "WV",
    "Idaho": "ID",
    "Hawaii": "HI",
    "New Hampshire": "NH",
    "Maine": "ME",
    "Montana": "MT",
    "Rhode Island": "RI",
    "Delaware": "DE",
    "South Dakota": "SD",
    "North Dakota": "ND",
    "Alaska": "AK",
    "Vermont": "VT",
    "Wyoming": "WY"
}

# Financial centers get special highlighting
financial_centers = ["New York", "California", "Illinois", "Texas", "Massachusetts", "Connecticut"]

col1, col2 = st.columns(2)

with col1:
    st.subheader("🏦 Major Financial Centers")
    st.markdown("*Primary investment banking hubs*")
    
    # Create a list to track financial center selections
    financial_center_selections = []
    
    for state in financial_centers:
        if st.checkbox(f"📍 {state}", key=f"state_{state}"):
            financial_center_selections.append(state)
    
    # Add description for each financial center
    if "New York" in financial_center_selections:
        st.caption("NYC: Wall Street, largest IB hub")
    if "California" in financial_center_selections:
        st.caption("CA: SF/LA tech & entertainment M&A")
    if "Illinois" in financial_center_selections:
        st.caption("IL: Chicago derivatives & middle market")
    if "Texas" in financial_center_selections:
        st.caption("TX: Dallas/Houston energy M&A")
    if "Massachusetts" in financial_center_selections:
        st.caption("MA: Boston biotech & PE hub")
    if "Connecticut" in financial_center_selections:
        st.caption("CT: Greenwich/Stamford hedge funds")

with col2:
    st.subheader("🌎 All US States")
    
    # Default selections include financial centers if checked
    default_selections = ["New York", "California", "Illinois"]
    
    # Add any checked financial centers to the multiselect
    for fc in financial_center_selections:
        if fc not in default_selections:
            default_selections.append(fc)
    
    selected_states = st.multiselect(
        'Select additional states:',
        options=list(us_states.keys()),
        default=default_selections,
        key="states_input"
    )

# Combine selections (remove duplicates)
all_selected_states = list(set(selected_states + financial_center_selections))
target_states = [us_states[state] for state in all_selected_states if state in us_states]

# Show selected states summary
if target_states:
    if "nationwide" in target_states:
        st.info("🌎 Searching nationwide across all US states")
    else:
        # Count financial centers vs other states
        fc_count = len([s for s in all_selected_states if s in financial_centers])
        other_count = len(all_selected_states) - fc_count
        
        st.info(f"🎯 Targeting {len(target_states)} states: {fc_count} financial centers + {other_count} additional states")
        
        # Show breakdown
        with st.expander("View selected states"):
            col1, col2 = st.columns(2)
            with col1:
                st.write("**Financial Centers:**")
                for state in all_selected_states:
                    if state in financial_centers:
                        st.write(f"• {state}")
            with col2:
                st.write("**Other States:**")
                for state in all_selected_states:
                    if state not in financial_centers:
                        st.write(f"• {state}")

# Step 4: Search Configuration
st.header('Step 4: ⚙️ Search Configuration')

col1, col2 = st.columns(2)

with col1:
    confidence_options = {
        "Cast Wide Net (0.25)": 0.25,
        "Balanced (0.50)": 0.50,
        "High Relevance (0.75)": 0.75,
        "Very Specific (0.90)": 0.90
    }
    
    selected_confidence = st.selectbox(
        "Relevance threshold:",
        options=list(confidence_options.keys()),
        index=1
    )
    confidence_threshold = confidence_options[selected_confidence]

with col2:
    processing_options = {
        "Quick Scan": "Fast",
        "Standard Search": "Balanced", 
        "Deep Search": "Thorough"
    }
    
    selected_processing = st.selectbox(
        "Search depth:",
        options=list(processing_options.keys()),
        index=1
    )
    processing_mode = processing_options[selected_processing]

# Job Sources Configuration
st.subheader("📍 Job Posting Sources")
st.markdown("*Select sources to maximize job discovery - expand each category*")

# Initialize source tracking
selected_sources_count = 0
source_mapping = {}

# Major Job Boards
with st.expander("🌐 Major Job Boards", expanded=True):
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        search_linkedin = st.checkbox("LinkedIn Jobs", value=True, key="linkedin")
        search_indeed = st.checkbox("Indeed", value=True, key="indeed")
        search_glassdoor = st.checkbox("Glassdoor", value=True, key="glassdoor")
    
    with col2:
        search_ziprecruiter = st.checkbox("ZipRecruiter", value=True, key="ziprecruiter")
        search_monster = st.checkbox("Monster", value=True, key="monster")
        search_careerbuilder = st.checkbox("CareerBuilder", value=True, key="careerbuilder")
    
    with col3:
        search_simplyhired = st.checkbox("SimplyHired", value=True, key="simplyhired")
        search_jobscom = st.checkbox("Jobs.com", value=True, key="jobscom")
        search_usajobs = st.checkbox("USAJobs (Gov)", value=False, key="usajobs")
    
    with col4:
        search_dice = st.checkbox("Dice (Tech)", value=True, key="dice")
        search_flexjobs = st.checkbox("FlexJobs", value=False, key="flexjobs")
        search_remote = st.checkbox("Remote.co", value=False, key="remote")

# Finance-Specific Job Sites
with st.expander("💼 Finance & Banking Specialized", expanded=True):
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        search_efinancial = st.checkbox("eFinancialCareers", value=True, key="efinancial")
        search_wallstjobs = st.checkbox("Wall Street Jobs", value=True, key="wallstjobs")
        search_financejobs = st.checkbox("FinanceJobs.com", value=True, key="financejobs")
    
    with col2:
        search_selbyjennings = st.checkbox("Selby Jennings", value=True, key="selbyjennings")
        search_robertwalters = st.checkbox("Robert Walters", value=True, key="robertwalters")
        search_michaelpage = st.checkbox("Michael Page", value=True, key="michaelpage")
    
    with col3:
        search_hays = st.checkbox("Hays Finance", value=True, key="hays")
        search_randstad = st.checkbox("Randstad Finance", value=True, key="randstad")
        search_adecco = st.checkbox("Adecco Finance", value=True, key="adecco")
    
    with col4:
        search_kforce = st.checkbox("Kforce Finance", value=True, key="kforce")
        search_roberthalf = st.checkbox("Robert Half", value=True, key="roberthalf")
        search_aerotek = st.checkbox("Aerotek Finance", value=True, key="aerotek")

# Investment Banking Specific
with st.expander("🏦 Investment Banking Focused", expanded=False):
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        search_ib_specific = st.checkbox("IBankingFAQ Jobs", value=True, key="ib_specific")
        search_mergersandinquisitions = st.checkbox("M&I Job Board", value=True, key="mergersandinquisitions")
        search_wallstreetoasis = st.checkbox("WSO Job Board", value=True, key="wallstreetoasis")
    
    with col2:
        search_financialservices = st.checkbox("FS Careers", value=True, key="financialservices")
        search_cityam = st.checkbox("CityAM Jobs (UK)", value=False, key="cityam")
        search_efinancialuk = st.checkbox("eFC London", value=False, key="efinancialuk")
    
    with col3:
        search_buyside = st.checkbox("Buyside Jobs", value=True, key="buyside")
        search_hedgefund = st.checkbox("HF Careers", value=True, key="hedgefund")
        search_privateequity = st.checkbox("PE Jobs", value=True, key="privateequity")
    
    with col4:
        search_venturecapital = st.checkbox("VC Careers", value=True, key="venturecapital")
        search_corporatedev = st.checkbox("Corp Dev Jobs", value=True, key="corporatedev")
        search_restructuring = st.checkbox("Restructuring Jobs", value=True, key="restructuring")

# Company Career Pages
with st.expander("🏢 Direct Company Career Pages", expanded=False):
    
    # Bulge Bracket
    st.markdown("**Bulge Bracket Banks**")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        search_goldman = st.checkbox("Goldman Sachs", value=True, key="goldman")
        search_jpmorgan = st.checkbox("JP Morgan", value=True, key="jpmorgan")
    with col2:
        search_morganstanley = st.checkbox("Morgan Stanley", value=True, key="morganstanley")
        search_bofa = st.checkbox("Bank of America", value=True, key="bofa")
    with col3:
        search_citi = st.checkbox("Citigroup", value=True, key="citi")
        search_barclays = st.checkbox("Barclays", value=True, key="barclays")
    with col4:
        search_credit_suisse = st.checkbox("Credit Suisse", value=True, key="credit_suisse")
        search_deutsche = st.checkbox("Deutsche Bank", value=True, key="deutsche")
    
    st.markdown("---")
    
    # Elite Boutiques
    st.markdown("**Elite Boutiques**")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        search_evercore = st.checkbox("Evercore", value=True, key="evercore")
        search_lazard = st.checkbox("Lazard", value=True, key="lazard")
    with col2:
        search_centerview = st.checkbox("Centerview", value=True, key="centerview")
        search_moelis = st.checkbox("Moelis", value=True, key="moelis")
    with col3:
        search_perella = st.checkbox("Perella Weinberg", value=True, key="perella")
        search_greenhill = st.checkbox("Greenhill", value=True, key="greenhill")
    with col4:
        search_rothschild = st.checkbox("Rothschild", value=True, key="rothschild")
        search_guggenheim = st.checkbox("Guggenheim", value=True, key="guggenheim")
    
    st.markdown("---")
    
    # Middle Market
    st.markdown("**Middle Market Banks**")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        search_jefferies = st.checkbox("Jefferies", value=True, key="jefferies")
        search_piper = st.checkbox("Piper Sandler", value=True, key="piper")
    with col2:
        search_cowen = st.checkbox("Cowen", value=True, key="cowen")
        search_stifel = st.checkbox("Stifel", value=True, key="stifel")
    with col3:
        search_harris = st.checkbox("Harris Williams", value=True, key="harris")
        search_lincoln = st.checkbox("Lincoln International", value=True, key="lincoln")
    with col4:
        search_william = st.checkbox("William Blair", value=True, key="william")
        search_raymond = st.checkbox("Raymond James", value=True, key="raymond")

# Private Equity & Alternative Investments
with st.expander("💰 Private Equity & Alternative Investments", expanded=False):
    
    # Mega Funds
    st.markdown("**Mega Funds**")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        search_blackstone = st.checkbox("Blackstone", value=True, key="blackstone")
        search_kkr = st.checkbox("KKR", value=True, key="kkr")
    with col2:
        search_apollo = st.checkbox("Apollo", value=True, key="apollo")
        search_carlyle = st.checkbox("Carlyle", value=True, key="carlyle")
    with col3:
        search_bain = st.checkbox("Bain Capital", value=True, key="bain")
        search_tpg = st.checkbox("TPG", value=True, key="tpg")
    with col4:
        search_warburg = st.checkbox("Warburg Pincus", value=True, key="warburg")
        search_advent = st.checkbox("Advent", value=True, key="advent")
    
    st.markdown("---")
    
    # Hedge Funds
    st.markdown("**Hedge Funds**")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        search_citadel = st.checkbox("Citadel", value=True, key="citadel")
        search_bridgewater = st.checkbox("Bridgewater", value=True, key="bridgewater")
    with col2:
        search_renaissance = st.checkbox("Renaissance", value=True, key="renaissance")
        search_twosigma = st.checkbox("Two Sigma", value=True, key="twosigma")
    with col3:
        search_millennium = st.checkbox("Millennium", value=True, key="millennium")
        search_point72 = st.checkbox("Point72", value=True, key="point72")
    with col4:
        search_de_shaw = st.checkbox("D.E. Shaw", value=True, key="de_shaw")
        search_jane_street = st.checkbox("Jane Street", value=True, key="jane_street")

# Job Aggregators & Meta-Search
with st.expander("🔍 Job Aggregators & Meta-Search", expanded=False):
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        search_google_jobs = st.checkbox("Google for Jobs", value=True, key="google_jobs")
        search_bing_jobs = st.checkbox("Bing Jobs", value=True, key="bing_jobs")
        search_jooble = st.checkbox("Jooble", value=True, key="jooble")
    
    with col2:
        search_jobrapido = st.checkbox("Jobrapido", value=True, key="jobrapido")
        search_trovit = st.checkbox("Trovit Jobs", value=True, key="trovit")
        search_mitula = st.checkbox("Mitula Jobs", value=True, key="mitula")
    
    with col3:
        search_jobzilla = st.checkbox("Jobzilla", value=True, key="jobzilla")
        search_jobvertise = st.checkbox("Jobvertise", value=True, key="jobvertise")
        search_jobisland = st.checkbox("Job Island", value=True, key="jobisland")
    
    with col4:
        search_jobspider = st.checkbox("JobSpider", value=True, key="jobspider")
        search_jobbank = st.checkbox("Job Bank USA", value=True, key="jobbank")
        search_snagajob = st.checkbox("Snagajob", value=True, key="snagajob")

# University & MBA Career Centers
with st.expander("🎓 University Career Centers", expanded=False):
    
    # Ivy League
    st.markdown("**Ivy League & Top MBA Programs**")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        search_harvard = st.checkbox("Harvard Business", value=True, key="harvard")
        search_wharton = st.checkbox("Wharton", value=True, key="wharton")
        search_columbia = st.checkbox("Columbia Business", value=True, key="columbia")
    
    with col2:
        search_kellogg = st.checkbox("Kellogg", value=True, key="kellogg")
        search_booth = st.checkbox("Booth (Chicago)", value=True, key="booth")
        search_sloan = st.checkbox("Sloan (MIT)", value=True, key="sloan")
    
    with col3:
        search_stern = st.checkbox("Stern (NYU)", value=True, key="stern")
        search_haas = st.checkbox("Haas (Berkeley)", value=True, key="haas")
        search_fuqua = st.checkbox("Fuqua (Duke)", value=True, key="fuqua")
    
    with col4:
        search_princeton = st.checkbox("Princeton", value=True, key="princeton")
        search_yale = st.checkbox("Yale", value=True, key="yale")
        search_stanford = st.checkbox("Stanford", value=True, key="stanford")

# Industry Publications & Forums
with st.expander("📰 Industry Publications & Forums", expanded=False):
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        search_bloomberg_jobs = st.checkbox("Bloomberg Careers", value=True, key="bloomberg_jobs")
        search_reuters_jobs = st.checkbox("Reuters Jobs", value=True, key="reuters_jobs")
        search_wsj_jobs = st.checkbox("WSJ Careers", value=True, key="wsj_jobs")
    
    with col2:
        search_ft_jobs = st.checkbox("Financial Times", value=True, key="ft_jobs")
        search_barrons = st.checkbox("Barron's Jobs", value=True, key="barrons")
        search_institutional = st.checkbox("Institutional Investor", value=True, key="institutional")
    
    with col3:
        search_dealbook = st.checkbox("DealBook Jobs", value=True, key="dealbook")
        search_pitchbook = st.checkbox("PitchBook Careers", value=True, key="pitchbook")
        search_preqin = st.checkbox("Preqin Jobs", value=True, key="preqin")
    
    with col4:
        search_mergermarket = st.checkbox("Mergermarket", value=True, key="mergermarket")
        search_intralinks = st.checkbox("Intralinks Jobs", value=True, key="intralinks")
        search_refinitiv = st.checkbox("Refinitiv Careers", value=True, key="refinitiv")

# International Sources
with st.expander("🌍 International Sources", expanded=False):
    
    # UK/Europe
    st.markdown("**UK & Europe**")
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        search_totaljobs = st.checkbox("TotalJobs (UK)", value=False, key="totaljobs")
        search_reed = st.checkbox("Reed (UK)", value=False, key="reed")
        search_jobsite = st.checkbox("Jobsite (UK)", value=False, key="jobsite")
    
    with col2:
        search_stepstone = st.checkbox("StepStone (EU)", value=False, key="stepstone")
        search_xing = st.checkbox("XING (DACH)", value=False, key="xing")
        search_viadeo = st.checkbox("Viadeo (France)", value=False, key="viadeo")
    
    # Asia-Pacific
    st.markdown("**Asia-Pacific**")
    with col3:
        search_jobsdb = st.checkbox("JobsDB (Asia)", value=False, key="jobsdb")
        search_seek = st.checkbox("Seek (Australia)", value=False, key="seek")
        search_jobstreet = st.checkbox("JobStreet (SEA)", value=False, key="jobstreet")
    
    # Canada
    st.markdown("**Canada**")
    with col4:
        search_workopolis = st.checkbox("Workopolis", value=False, key="workopolis")
        search_jobbank_ca = st.checkbox("Job Bank Canada", value=False, key="jobbank_ca")
        search_monster_ca = st.checkbox("Monster Canada", value=False, key="monster_ca")

# Collect all source selections
all_sources = {
    # Major Job Boards
    "linkedin": search_linkedin, "indeed": search_indeed, "glassdoor": search_glassdoor,
    "ziprecruiter": search_ziprecruiter, "monster": search_monster, "careerbuilder": search_careerbuilder,
    "simplyhired": search_simplyhired, "jobscom": search_jobscom, "usajobs": search_usajobs,
    "dice": search_dice, "flexjobs": search_flexjobs, "remote": search_remote,
    
    # Finance Specialized
    "efinancial": search_efinancial, "wallstjobs": search_wallstjobs, "financejobs": search_financejobs,
    "selbyjennings": search_selbyjennings, "robertwalters": search_robertwalters, "michaelpage": search_michaelpage,
    "hays": search_hays, "randstad": search_randstad, "adecco": search_adecco,
    "kforce": search_kforce, "roberthalf": search_roberthalf, "aerotek": search_aerotek,
    
    # IB Specific
    "ib_specific": search_ib_specific, "mergersandinquisitions": search_mergersandinquisitions,
    "wallstreetoasis": search_wallstreetoasis, "financialservices": search_financialservices,
    "buyside": search_buyside, "hedgefund": search_hedgefund, "privateequity": search_privateequity,
    "venturecapital": search_venturecapital, "corporatedev": search_corporatedev,
    
    # Company Career Pages
    "goldman": search_goldman, "jpmorgan": search_jpmorgan, "morganstanley": search_morganstanley,
    "bofa": search_bofa, "evercore": search_evercore, "lazard": search_lazard,
    "blackstone": search_blackstone, "kkr": search_kkr, "apollo": search_apollo,
    
    # Aggregators
    "google_jobs": search_google_jobs, "bing_jobs": search_bing_jobs, "jooble": search_jooble,
    
    # Universities
    "harvard": search_harvard, "wharton": search_wharton, "columbia": search_columbia,
    
    # Publications
    "bloomberg_jobs": search_bloomberg_jobs, "reuters_jobs": search_reuters_jobs, "wsj_jobs": search_wsj_jobs
}

# Count selected sources by category
total_selected = sum(1 for selected in all_sources.values() if selected)
major_boards_selected = sum(1 for key in ["linkedin", "indeed", "glassdoor", "ziprecruiter", "monster"] if all_sources.get(key, False))
finance_specialized_selected = sum(1 for key in ["efinancial", "wallstjobs", "selbyjennings", "buyside", "hedgefund"] if all_sources.get(key, False))
company_pages_selected = sum(1 for key in ["goldman", "jpmorgan", "morganstanley", "evercore", "blackstone"] if all_sources.get(key, False))

# Compact summary
st.markdown("---")
col1, col2, col3, col4 = st.columns(4)

with col1:
    st.metric("📊 Total Sources", total_selected)

with col2:
    st.metric("🌐 Major Boards", f"{major_boards_selected}/5")

with col3:
    st.metric("💼 Finance Sites", f"{finance_specialized_selected}/5")

with col4:
    st.metric("🏢 Company Pages", f"{company_pages_selected}/5")

# Quick selection buttons (compact)
col1, col2, col3 = st.columns(3)

with col1:
    if st.button("✅ Select Essentials", help="LinkedIn, Indeed, eFinancial, top banks"):
        st.info("Essential sources selected")

with col2:
    if st.button("🏦 Select All Finance", help="All finance-specific sources"):
        st.info("All finance sources selected")

with col3:
    if st.button("🌍 Select Everything", help="All available sources"):
        st.info("All sources selected")

if total_selected > 0:
    st.success(f"✅ {total_selected} job sources configured for comprehensive search")
else:
    st.warning("⚠️ Please select at least one job source")

# Pipeline Execution
def execute_pipeline_flow():
    """Executes the job finding pipeline."""
    
    if not source_text:
        st.error("❌ Please generate search context first (Step 1)")
        return
    
    if not final_job_titles:
        st.error("❌ Please select job titles (Step 2)")
        return
    
    params = {
        "source_text": source_text,
        "target_job_titles": final_job_titles,
        "target_states": target_states,
        "confidence_threshold": confidence_threshold,
        "processing_mode": processing_mode,
        "job_sources": {
            "linkedin": search_linkedin,
            "indeed": search_indeed,
            "company_sites": search_company_sites,
            "glassdoor": search_glassdoor,
            "efinancialcareers": search_specialized,
            "recruiters": search_recruiters
        }
    }

    with st.spinner('🔄 Searching for job postings...'):
        results = run_pipeline(params)

    if results.get("status") == "success":
        st.success(f"✅ {results.get('message')}")
        
        # Store results in session state
        st.session_state['pipeline_results'] = results
        st.session_state['found_jobs'] = results.get('jobs', [])
    else:
        st.error(f"❌ Pipeline failed: {results.get('message')}")

# Run pipeline button
if run_button_pressed:
    execute_pipeline_flow()

# Step 5: Results and Selection
if 'found_jobs' in st.session_state and st.session_state['found_jobs']:
    st.header('Step 5: 📊 Found Job Postings')
    
    jobs_df = pd.DataFrame(st.session_state['found_jobs'])
    
    # Select all checkbox
    col1, col2, col3 = st.columns([1, 1, 2])
    with col1:
        select_all = st.checkbox("Select All Jobs", key="select_all_jobs")
    
    with col2:
        st.metric("Total Jobs Found", len(jobs_df))
    
    # Display jobs with selection
    st.subheader("🎯 Select Jobs for Outreach")
    
    selected_jobs = []
    
    for idx, job in enumerate(st.session_state['found_jobs']):
        col1, col2 = st.columns([3, 1])
        
        with col1:
            # Job details
            st.markdown(f"**{job['company']}** - {job['title']}")
            st.caption(f"📍 {job['location']} | 💰 {job['salary_range']} | 📅 Posted: {job['posted_date']}")
            
            with st.expander("View Details"):
                st.write(f"**Description:** {job['description']}")
                st.write(f"**Company Insights:** {job['company_insights']}")
                st.write(f"**Contact:** {job['contact_email']}")
                st.write(f"**URL:** {job['job_url']}")
        
        with col2:
            # Individual selection
            is_selected = st.checkbox(
                "Select", 
                value=select_all, 
                key=f"job_select_{job['id']}"
            )
            
            if is_selected:
                selected_jobs.append(job)
    
    # Update session state with selections
    st.session_state.selected_jobs_for_outreach = selected_jobs
    
    # Step 6: Email Outreach
    if selected_jobs:
        st.header('Step 6: 📧 Email Outreach Configuration')
        
        st.info(f"📋 {len(selected_jobs)} jobs selected for outreach")
        
        # Recruitment firm information
        st.subheader("Your Information")
        col1, col2 = st.columns(2)
        
        with col1:
            firm_name = st.text_input("Recruitment Firm Name", value="Elite Talent Partners")
            your_name = st.text_input("Your Name", value="")
            your_title = st.text_input("Your Title", value="Senior Recruitment Consultant")
        
        with col2:
            your_email = st.text_input("Your Email", value="")
            your_phone = st.text_input("Your Phone", value="")
        
        # Email customization
        st.subheader("Email Strategy")
        
        email_tone = st.select_slider(
            "Email Tone",
            options=["Very Professional", "Professional", "Conversational", "Casual"],
            value="Professional"
        )
        
        urgency_level = st.select_slider(
            "Urgency Level",
            options=["Low", "Medium", "High", "Very High"],
            value="Medium"
        )
        
        # A/B testing for subject lines
        use_ab_testing = st.checkbox("Use A/B testing for subject lines", value=True)
        
        # Preview emails
        if st.button("🔍 Preview Emails", type="secondary"):
            recruitment_info = {
                'firm_name': firm_name,
                'your_name': your_name,
                'your_title': your_title,
                'your_email': your_email,
                'your_phone': your_phone
            }
            
            with st.spinner("Generating personalized emails..."):
                email_templates = generate_email_templates(selected_jobs, recruitment_info)
                st.session_state['email_templates'] = email_templates
        
        # Display email previews
        if 'email_templates' in st.session_state:
            st.subheader("📧 Email Previews")
            
            for template in st.session_state['email_templates'][:3]:  # Show first 3
                with st.expander(f"Email to {template['company']} - {template['position']}"):
                    st.write("**Subject Line Options:**")
                    for i, subject in enumerate(template['subject_lines'][:3]):
                        st.write(f"{i+1}. {subject}")
                    
                    st.write("**Email Body:**")
                    st.text(template['email_body'])
            
            # Send emails button
            st.markdown("---")
            col1, col2, col3 = st.columns([1, 2, 1])
            
            with col2:
                if st.button("🚀 Send All Emails", type="primary", use_container_width=True):
                    with st.spinner(f"Sending {len(selected_jobs)} personalized emails..."):
                        time.sleep(3)  # Simulate sending
                        st.success(f"✅ Successfully sent {len(selected_jobs)} emails!")
                        st.balloons()
                        
                        # Show summary
                        st.subheader("📊 Outreach Summary")
                        st.write(f"- **Emails Sent:** {len(selected_jobs)}")
                        st.write(f"- **Companies Contacted:** {len(set(job['company'] for job in selected_jobs))}")
                        st.write(f"- **Expected Response Rate:** 15-25% (based on similar campaigns)")
                        st.write(f"- **Follow-up Scheduled:** 3 days")

# Sidebar summary
with st.sidebar:
    st.markdown("---")
    st.subheader("📋 Pipeline Summary")
    
    if 'current_topic' in st.session_state:
        st.write(f"**Niche:** {st.session_state['current_topic']}")
    
    if 'expanded_job_titles' in st.session_state:
        st.write(f"**Job Titles:** {len(st.session_state.get('expanded_job_titles', []))} variations")
    
    st.write(f"**States:** {len(target_states)} selected")
    
    if 'found_jobs' in st.session_state:
        st.write(f"**Jobs Found:** {len(st.session_state['found_jobs'])}")
    
    if 'selected_jobs_for_outreach' in st.session_state:
        st.write(f"**Selected for Outreach:** {len(st.session_state['selected_jobs_for_outreach'])}")
