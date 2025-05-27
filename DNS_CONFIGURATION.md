# DNS Configuration Guide for Email Authentication

## Overview

This guide provides step-by-step instructions for configuring DNS records to authenticate your domain for email sending through SendGrid. Proper DNS configuration is essential for email deliverability and compliance.

## Prerequisites

- Access to your domain's DNS management interface
- SendGrid account with domain authentication enabled
- Domain ownership verification completed

## Required DNS Records

### 1. SPF (Sender Policy Framework) Record

**Purpose**: Specifies which mail servers are authorized to send email on behalf of your domain.

**Record Type**: TXT  
**Name**: @ (root domain) or your subdomain  
**Value**: `v=spf1 include:sendgrid.net ~all`

**Example**:
```
Type: TXT
Name: @
Value: v=spf1 include:sendgrid.net ~all
TTL: 3600
```

### 2. DKIM (DomainKeys Identified Mail) Records

**Purpose**: Provides cryptographic authentication for your emails.

You'll need to add **two DKIM records** provided by SendGrid:

**Record 1**:
```
Type: CNAME
Name: s1._domainkey
Value: s1.domainkey.u[UNIQUE_ID].wl[UNIQUE_ID].sendgrid.net
TTL: 3600
```

**Record 2**:
```
Type: CNAME
Name: s2._domainkey
Value: s2.domainkey.u[UNIQUE_ID].wl[UNIQUE_ID].sendgrid.net
TTL: 3600
```

> **Note**: Replace `[UNIQUE_ID]` with the actual values provided in your SendGrid dashboard under Settings > Sender Authentication.

### 3. DMARC (Domain-based Message Authentication) Record

**Purpose**: Defines how receiving mail servers should handle emails that fail SPF or DKIM checks.

**Record Type**: TXT  
**Name**: _dmarc  
**Value**: `v=DMARC1; p=none; rua=mailto:dmarc-reports@robertsonwright.co.uk; ruf=mailto:dmarc-failures@robertsonwright.co.uk; sp=none; adkim=r; aspf=r`

**Example**:
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@robertsonwright.co.uk; ruf=mailto:dmarc-failures@robertsonwright.co.uk; sp=none; adkim=r; aspf=r
TTL: 3600
```

### 4. BIMI (Brand Indicators for Message Identification) Record (Optional)

**Purpose**: Displays your brand logo in supported email clients.

**Record Type**: TXT  
**Name**: default._bimi  
**Value**: `v=BIMI1; l=https://robertsonwright.co.uk/logo.svg; a=https://robertsonwright.co.uk/bimi/authority.pem`

**Example**:
```
Type: TXT
Name: default._bimi
Value: v=BIMI1; l=https://robertsonwright.co.uk/logo.svg; a=https://robertsonwright.co.uk/bimi/authority.pem
TTL: 3600
```

## Step-by-Step Configuration

### Step 1: Access SendGrid Dashboard

1. Log into your SendGrid account
2. Navigate to **Settings** > **Sender Authentication**
3. Click **Authenticate Your Domain**
4. Follow the setup wizard to get your specific DNS values

### Step 2: Configure DNS Records

#### For Common DNS Providers:

**Cloudflare**:
1. Log into Cloudflare dashboard
2. Select your domain
3. Go to **DNS** tab
4. Click **Add record**
5. Add each record type with the values above

**GoDaddy**:
1. Log into GoDaddy account
2. Go to **My Products** > **DNS**
3. Select your domain
4. Click **Add** to create new records

**Namecheap**:
1. Log into Namecheap account
2. Go to **Domain List** > **Manage**
3. Select **Advanced DNS**
4. Add records in the **Host Records** section

**Route 53 (AWS)**:
1. Open Route 53 console
2. Select your hosted zone
3. Click **Create Record**
4. Add each record with appropriate values

### Step 3: Verify Configuration

#### Using Command Line Tools:

**Check SPF Record**:
```bash
dig TXT robertsonwright.co.uk | grep spf
# Expected: v=spf1 include:sendgrid.net ~all
```

**Check DKIM Records**:
```bash
dig CNAME s1._domainkey.robertsonwright.co.uk
dig CNAME s2._domainkey.robertsonwright.co.uk
```

**Check DMARC Record**:
```bash
dig TXT _dmarc.robertsonwright.co.uk
# Expected: v=DMARC1; p=none; rua=mailto:...
```

#### Using Online Tools:

1. **MXToolbox**: https://mxtoolbox.com/spf.aspx
2. **DMARC Analyzer**: https://www.dmarcanalyzer.com/
3. **Mail Tester**: https://www.mail-tester.com/

### Step 4: Verify in SendGrid

1. Return to SendGrid dashboard
2. Go to **Settings** > **Sender Authentication**
3. Click **Verify** next to your domain
4. Wait for verification (can take up to 48 hours)

## Configuration Examples

### Complete DNS Configuration for robertsonwright.co.uk

```dns
# SPF Record
Type: TXT
Name: @
Value: v=spf1 include:sendgrid.net ~all
TTL: 3600

# DKIM Record 1 (replace with actual values from SendGrid)
Type: CNAME
Name: s1._domainkey
Value: s1.domainkey.u1234567.wl1234567.sendgrid.net
TTL: 3600

# DKIM Record 2 (replace with actual values from SendGrid)
Type: CNAME
Name: s2._domainkey
Value: s2.domainkey.u1234567.wl1234567.sendgrid.net
TTL: 3600

# DMARC Record
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc-reports@robertsonwright.co.uk; ruf=mailto:dmarc-failures@robertsonwright.co.uk; sp=none; adkim=r; aspf=r
TTL: 3600

# BIMI Record (optional)
Type: TXT
Name: default._bimi
Value: v=BIMI1; l=https://robertsonwright.co.uk/logo.svg; a=https://robertsonwright.co.uk/bimi/authority.pem
TTL: 3600
```

## Troubleshooting

### Common Issues:

1. **DNS Propagation Delay**
   - DNS changes can take 24-48 hours to propagate globally
   - Use `dig` command to check if records are visible

2. **Incorrect DKIM Values**
   - Ensure you're using the exact values from SendGrid dashboard
   - Check for typos in the CNAME records

3. **SPF Record Conflicts**
   - Only one SPF record per domain is allowed
   - If you have existing SPF, merge the includes

4. **DMARC Policy Too Strict**
   - Start with `p=none` for monitoring
   - Gradually move to `p=quarantine` then `p=reject`

### Verification Commands:

```bash
# Check all DNS records at once
dig TXT robertsonwright.co.uk
dig CNAME s1._domainkey.robertsonwright.co.uk
dig CNAME s2._domainkey.robertsonwright.co.uk
dig TXT _dmarc.robertsonwright.co.uk

# Test email authentication
echo "Test email" | mail -s "Test Subject" test@example.com
```

## DMARC Policy Progression

### Phase 1: Monitoring (p=none)
```
v=DMARC1; p=none; rua=mailto:dmarc-reports@robertsonwright.co.uk
```

### Phase 2: Quarantine (after 2-4 weeks of monitoring)
```
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@robertsonwright.co.uk; pct=25
```

### Phase 3: Reject (after successful quarantine phase)
```
v=DMARC1; p=reject; rua=mailto:dmarc-reports@robertsonwright.co.uk; pct=100
```

## Monitoring and Maintenance

### Regular Checks:
1. **Weekly**: Review DMARC reports for authentication failures
2. **Monthly**: Check DNS record integrity
3. **Quarterly**: Review and update DMARC policy if needed

### Tools for Monitoring:
- **DMARC Analyzer**: https://www.dmarcanalyzer.com/
- **Postmark DMARC**: https://dmarc.postmarkapp.com/
- **Google Postmaster Tools**: https://postmaster.google.com/

## Security Best Practices

1. **Use Strong DMARC Policy**: Progress from `p=none` to `p=reject`
2. **Monitor Reports**: Set up automated DMARC report processing
3. **Regular Audits**: Check DNS records monthly for unauthorized changes
4. **Backup DNS**: Keep records documented for disaster recovery

## Support Resources

- **SendGrid Documentation**: https://docs.sendgrid.com/ui/account-and-settings/how-to-set-up-domain-authentication
- **DMARC.org**: https://dmarc.org/
- **RFC 7489 (DMARC)**: https://tools.ietf.org/html/rfc7489
- **RFC 7208 (SPF)**: https://tools.ietf.org/html/rfc7208

## Next Steps

After completing DNS configuration:

1. ✅ Verify all records are properly configured
2. ✅ Test email sending through the application
3. ✅ Monitor DMARC reports for the first week
4. ✅ Gradually strengthen DMARC policy
5. ✅ Set up automated monitoring and alerting 