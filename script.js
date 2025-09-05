class ZillaScraper {
    constructor() {
        this.results = [];
        this.currentIndex = 0;
        this.totalUrls = 0;
        this.isProcessing = false;
        
        // CORS proxy options - using multiple for redundancy
        this.corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/'
        ];
        this.currentProxyIndex = 0;
        
        // State-specific interest rates for 30-year fixed mortgages (as of 2024)
        this.stateInterestRates = {
            'AL': 7.25, 'AK': 7.35, 'AZ': 7.15, 'AR': 7.30, 'CA': 7.05, 'CO': 7.10, 'CT': 7.20, 'DE': 7.15,
            'FL': 7.10, 'GA': 7.20, 'HI': 7.40, 'ID': 7.25, 'IL': 7.15, 'IN': 7.20, 'IA': 7.25, 'KS': 7.25,
            'KY': 7.30, 'LA': 7.35, 'ME': 7.25, 'MD': 7.15, 'MA': 7.10, 'MI': 7.20, 'MN': 7.15, 'MS': 7.35,
            'MO': 7.25, 'MT': 7.30, 'NE': 7.25, 'NV': 7.20, 'NH': 7.20, 'NJ': 7.15, 'NM': 7.25, 'NY': 7.10,
            'NC': 7.20, 'ND': 7.30, 'OH': 7.20, 'OK': 7.30, 'OR': 7.15, 'PA': 7.15, 'RI': 7.20, 'SC': 7.25,
            'SD': 7.30, 'TN': 7.25, 'TX': 7.20, 'UT': 7.20, 'VT': 7.25, 'VA': 7.15, 'WA': 7.10, 'WV': 7.30,
            'WI': 7.20, 'WY': 7.30, 'DC': 7.15
        };
        this.defaultInterestRate = 7.20; // National average fallback
        
        // State-specific property tax rates (annual % of home value)
        this.statePropertyTaxRates = {
            'AL': 0.41, 'AK': 1.19, 'AZ': 0.62, 'AR': 0.63, 'CA': 0.75, 'CO': 0.51, 'CT': 2.14, 'DE': 0.57,
            'FL': 0.83, 'GA': 0.89, 'HI': 0.31, 'ID': 0.69, 'IL': 2.27, 'IN': 0.85, 'IA': 1.53, 'KS': 1.42,
            'KY': 0.86, 'LA': 0.55, 'ME': 1.28, 'MD': 1.06, 'MA': 1.21, 'MI': 1.54, 'MN': 1.12, 'MS': 0.81,
            'MO': 0.97, 'MT': 0.84, 'NE': 1.73, 'NV': 0.53, 'NH': 2.18, 'NJ': 2.49, 'NM': 0.80, 'NY': 1.68,
            'NC': 0.84, 'ND': 0.98, 'OH': 1.56, 'OK': 0.90, 'OR': 0.87, 'PA': 1.58, 'RI': 1.53, 'SC': 0.57,
            'SD': 1.32, 'TN': 0.64, 'TX': 1.69, 'UT': 0.60, 'VT': 1.90, 'VA': 0.82, 'WA': 0.84, 'WV': 0.59,
            'WI': 1.85, 'WY': 0.62, 'DC': 0.57
        };
        this.defaultPropertyTaxRate = 1.10; // National average fallback
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('startScraping').addEventListener('click', () => this.startScraping());
        document.getElementById('clearAll').addEventListener('click', () => this.clearAll());
        document.getElementById('downloadCsv').addEventListener('click', () => this.downloadCsv());
        document.getElementById('csvFile').addEventListener('change', (e) => this.handleFileUpload(e));
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const text = await file.text();
        const urls = this.parseCSV(text);
        document.getElementById('urlText').value = urls.join('\n');
    }

    parseCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const linksColumnIndex = headers.findIndex(h => h.includes('link'));
        
        if (linksColumnIndex === -1) {
            this.logStatus('Error: No "Links" column found in CSV', 'error');
            return [];
        }

        const urls = [];
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
            if (columns[linksColumnIndex] && columns[linksColumnIndex].trim()) {
                urls.push(columns[linksColumnIndex].trim());
            }
        }

        return urls;
    }

    extractUrls() {
        const textInput = document.getElementById('urlText').value;
        const urls = textInput
            .split(/[\s\n,]+/)
            .map(url => url.trim())
            .filter(url => url && this.isValidZillaUrl(url));

        // Remove duplicates while preserving order
        const uniqueUrls = [...new Set(urls)];
        
        // Log if duplicates were found
        if (urls.length !== uniqueUrls.length) {
            const duplicateCount = urls.length - uniqueUrls.length;
            console.log(`Removed ${duplicateCount} duplicate URL${duplicateCount > 1 ? 's' : ''}. Processing ${uniqueUrls.length} unique URLs.`);
        }

        return uniqueUrls;
    }

    isValidZillaUrl(url) {
        try {
            const urlObj = new URL(url);
            return (urlObj.hostname.includes('zilla.com') || urlObj.hostname.includes('zillow.com')) && 
                   (url.includes('/homedetails/') || url.includes('/b/'));
        } catch {
            return false;
        }
    }

    async startScraping() {
        if (this.isProcessing) return;

        // Get original URL count for duplicate detection
        const textInput = document.getElementById('urlText').value;
        const originalUrls = textInput
            .split(/[\s\n,]+/)
            .map(url => url.trim())
            .filter(url => url && this.isValidZillaUrl(url));
            
        const urls = this.extractUrls();
        if (urls.length === 0) {
            alert('Please enter valid Zilla URLs');
            return;
        }
        
        // Log duplicate removal info
        if (originalUrls.length !== urls.length) {
            const duplicateCount = originalUrls.length - urls.length;
            this.logStatus(`Removed ${duplicateCount} duplicate URL${duplicateCount > 1 ? 's' : ''}. Processing ${urls.length} unique URLs.`, 'info');
        }

        this.isProcessing = true;
        this.results = [];
        this.currentIndex = 0;
        this.totalUrls = urls.length;

        // Show progress section
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('startScraping').disabled = true;

        this.logStatus(`Starting to scrape ${urls.length} properties...`, 'info');

        for (let i = 0; i < urls.length; i++) {
            this.currentIndex = i + 1;
            this.updateProgress();
            
            let success = false;
            let retryCount = 0;
            const maxRetries = 2;
            
            while (!success && retryCount <= maxRetries) {
                try {
                    const retryText = retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : '';
                    this.logStatus(`Processing ${i + 1}/${urls.length}: ${urls[i]}${retryText}`, 'info');
                    
                    const data = await this.scrapeProperty(urls[i]);
                    this.results.push(data);
                    this.logStatus(`✓ Successfully scraped: ${data.address || 'Unknown address'}`, 'success');
                    success = true;
                } catch (error) {
                    retryCount++;
                    if (retryCount <= maxRetries) {
                        this.logStatus(`⚠ Attempt ${retryCount} failed for ${urls[i]}: ${error.message}`, 'info');
                        await this.delay(5000); // Wait 5 seconds before retry to avoid rate limiting
                    } else {
                        this.logStatus(`✗ Failed to scrape ${urls[i]} after ${maxRetries} retries: ${error.message}`, 'error');
                        this.results.push({
                            url: urls[i],
                            status: 'ERROR',
                            error: error.message,
                            address: 'INFO_UNAVAILABLE',
                            purchasePrice: 'INFO_UNAVAILABLE',
                            downPayment20: 'INFO_UNAVAILABLE',
                            estimatedMortgage: 'INFO_UNAVAILABLE',
                            totalMonthlyPayment: 'INFO_UNAVAILABLE',
                            beds: 'INFO_UNAVAILABLE',
                            baths: 'INFO_UNAVAILABLE',
                            yearBuilt: 'INFO_UNAVAILABLE',
                            sqft: 'INFO_UNAVAILABLE',
                            daysListed: 'INFO_UNAVAILABLE',
                            realtorName: 'INFO_UNAVAILABLE'
                        });
                    }
                }
            }

            // Rate limiting - wait 3-5 seconds between requests with randomization to avoid IP blocking
            if (i < urls.length - 1) {
                const randomDelay = 3000 + Math.random() * 2000; // 3-5 seconds
                await this.delay(randomDelay);
            }
        }

        this.isProcessing = false;
        document.getElementById('startScraping').disabled = false;
        this.showResults();
        this.logStatus('✓ Scraping completed!', 'success');
    }

    async scrapeProperty(url) {
        const html = await this.fetchWithProxy(url);
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const address = this.extractAddress(doc);
        const purchasePrice = this.extractPrice(doc);
        
        const data = {
            url: url,
            status: 'SUCCESS',
            address: address,
            purchasePrice: purchasePrice,
            downPayment20: 'INFO_UNAVAILABLE',
            estimatedMortgage: this.calculateMortgage(purchasePrice, address),
            totalMonthlyPayment: this.calculateTotalMonthlyPayment(purchasePrice, address),
            beds: this.extractBeds(doc),
            baths: this.extractBaths(doc),
            yearBuilt: this.extractYearBuilt(doc),
            sqft: this.extractSqft(doc),
            daysListed: this.extractDaysListed(doc),
            realtorName: this.extractRealtorName(doc)
        };

        // Calculate 20% down payment from purchase price
        if (data.purchasePrice !== 'INFO_UNAVAILABLE') {
            const price = this.parsePrice(data.purchasePrice);
            if (price && price > 0) {
                data.downPayment20 = '$' + Math.round(price * 0.2).toLocaleString();
            }
        }

        return data;
    }

    async fetchWithProxy(url) {
        let lastError;
        
        for (let i = 0; i < this.corsProxies.length; i++) {
            const proxyIndex = (this.currentProxyIndex + i) % this.corsProxies.length;
            const proxyUrl = this.corsProxies[proxyIndex] + encodeURIComponent(url);
            
            try {
                const response = await fetch(proxyUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 15000 // 15 second timeout
                });
                
                if (response.ok) {
                    this.currentProxyIndex = proxyIndex;
                    const text = await response.text();
                    // Basic validation that we got HTML content
                    if (text.length > 1000 && text.includes('<html')) {
                        return text;
                    }
                    throw new Error('Invalid response content');
                }
                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                lastError = error;
                this.logStatus(`Proxy ${proxyIndex + 1} failed: ${error.message}, trying next...`, 'info');
                
                // Longer delay before trying next proxy to avoid rate limiting
                await this.delay(1500);
            }
        }
        
        throw new Error(`All proxies failed. Last error: ${lastError.message}`);
    }

    extractAddress(doc) {
        const selectors = [
            'h1[data-testid="property-details-address"]',
            '.summary-container h1',
            '.ds-address-container h1',
            '.zsg-photo-card-address',
            'h1.notranslate',
            '[data-testid="bdp-building-address"]'
        ];
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element) return element.textContent.trim();
        }
        
        // Fallback: search for address pattern in text
        const text = doc.body.textContent;
        const addressMatch = text.match(/(\d+\s+[A-Za-z\s]+(?:St|Ave|Rd|Dr|Ln|Blvd|Way|Ct|Pl|Cir)[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2})/);
        if (addressMatch) return addressMatch[1];
        
        return 'INFO_UNAVAILABLE';
    }

    extractPrice(doc) {
        const selectors = [
            '[data-testid="price"]',
            '.summary-container .notranslate',
            '.ds-price .ds-value',
            '.zsg-photo-card-price',
            '.price-large',
            '[data-testid="price-history"] .Text-c11n-8-84-3__sc-aiai24-0'
        ];
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.includes('$')) {
                const priceText = element.textContent.trim();
                // Extract only the price, not any trailing text
                const priceMatch = priceText.match(/\$[\d,]+/);
                if (priceMatch) return priceMatch[0];
            }
        }
        
        // Fallback: search for standalone price pattern
        const text = doc.body.textContent;
        // Look for price that's not part of a larger number sequence
        const pricePattern = /(?:^|\s)\$(\d{1,3}(?:,\d{3})*(?:,\d{3})*)\s*(?:\s|$|[^\d])/g;
        const matches = [];
        let match;
        
        while ((match = pricePattern.exec(text)) !== null) {
            const price = parseInt(match[1].replace(/,/g, ''));
            if (price >= 50000 && price <= 50000000) { // Reasonable house price range
                matches.push(price);
            }
        }
        
        if (matches.length > 0) {
            // Return the most likely listing price (usually the largest reasonable price)
            const maxPrice = Math.max(...matches);
            return '$' + maxPrice.toLocaleString();
        }
        
        return 'INFO_UNAVAILABLE';
    }

    calculateMortgage(purchasePrice, address) {
        if (!purchasePrice || purchasePrice === 'INFO_UNAVAILABLE') {
            return 'INFO_UNAVAILABLE';
        }
        
        const price = this.parsePrice(purchasePrice);
        if (!price || price <= 0) {
            return 'INFO_UNAVAILABLE';
        }
        
        // Extract state from address to get appropriate interest rate
        const state = this.extractStateFromAddress(address);
        const interestRate = this.stateInterestRates[state] || this.defaultInterestRate;
        
        // Assume 20% down payment
        const downPayment = price * 0.20;
        const loanAmount = price - downPayment;
        
        // Calculate monthly payment using mortgage formula
        // M = P [ r(1 + r)^n ] / [ (1 + r)^n – 1 ]
        // Where: M = Monthly payment, P = Principal, r = Monthly interest rate, n = Number of payments
        const monthlyRate = (interestRate / 100) / 12;
        const numberOfPayments = 30 * 12; // 30 years
        
        const monthlyPayment = loanAmount * 
            (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / 
            (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
        
        return '$' + Math.round(monthlyPayment).toLocaleString();
    }
    
    calculateTotalMonthlyPayment(purchasePrice, address) {
        if (!purchasePrice || purchasePrice === 'INFO_UNAVAILABLE') {
            return 'INFO_UNAVAILABLE';
        }
        
        const price = this.parsePrice(purchasePrice);
        if (!price || price <= 0) {
            return 'INFO_UNAVAILABLE';
        }
        
        // Get the pure mortgage payment (P&I only)
        const mortgagePayment = this.calculateMortgage(purchasePrice, address);
        if (mortgagePayment === 'INFO_UNAVAILABLE') {
            return 'INFO_UNAVAILABLE';
        }
        
        const piPayment = this.parsePrice(mortgagePayment);
        if (!piPayment) return 'INFO_UNAVAILABLE';
        
        // Extract state for property tax rate
        const state = this.extractStateFromAddress(address);
        const propertyTaxRate = this.statePropertyTaxRates[state] || this.defaultPropertyTaxRate;
        
        // Calculate monthly property tax
        const annualPropertyTax = price * (propertyTaxRate / 100);
        const monthlyPropertyTax = annualPropertyTax / 12;
        
        // Calculate homeowner's insurance (typically 0.3% - 0.5% of home value annually)
        // Use higher rate for expensive properties
        const insuranceRate = price > 1000000 ? 0.5 : 0.35; // 0.35% for regular, 0.5% for luxury
        const annualInsurance = price * (insuranceRate / 100);
        const monthlyInsurance = annualInsurance / 12;
        
        // Total monthly payment = P&I + Taxes + Insurance
        const totalPayment = piPayment + monthlyPropertyTax + monthlyInsurance;
        
        return '$' + Math.round(totalPayment).toLocaleString();
    }
    
    extractStateFromAddress(address) {
        if (!address || address === 'INFO_UNAVAILABLE') {
            return null;
        }
        
        // Look for state abbreviation at the end of address (e.g., "CA", "NY", "TX")
        const stateMatch = address.match(/,\s*([A-Z]{2})\s*\d*$/);
        if (stateMatch) {
            return stateMatch[1];
        }
        
        // Fallback: look for state abbreviation anywhere in address
        const statePattern = /\b([A-Z]{2})\b/g;
        const matches = address.match(statePattern);
        if (matches) {
            // Return the last state abbreviation found
            const lastMatch = matches[matches.length - 1];
            if (this.stateInterestRates[lastMatch]) {
                return lastMatch;
            }
        }
        
        return null; // Will use default rate
    }

    extractBeds(doc) {
        // First try CSS selectors
        const selectors = [
            '[data-testid="bed-bath-item"]:first-child',
            '.ds-bed-bath-living-area-container span:first-child',
            '.zsg-content-header-top-container .zsg-icon-bed + span',
            '[data-testid="bed-bath-beyond-facts"] span:first-child'
        ];
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element) {
                const match = element.textContent.match(/(\d+)\s*bed/i);
                if (match && parseInt(match[1]) <= 20) return match[1];
            }
        }
        
        // Enhanced fallback: multiple bed patterns
        const text = doc.body.textContent;
        const bedPatterns = [
            /(\d{1,2})\s*bed(?:room)?s?\s/gi,
            /(\d{1,2})\s*bd\s/gi,
            /(\d{1,2})\s*br\s/gi,
            /Bedrooms?[:\s]*(\d{1,2})/gi,
            /(\d{1,2})\s*(?:bed|bedroom)s?(?:\s|$|,|\.|\/)/gi
        ];
        
        const foundBeds = [];
        for (const pattern of bedPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const beds = parseInt(match[1]);
                if (beds >= 0 && beds <= 20) { // Reasonable bed count including 0 (studio)
                    foundBeds.push(beds);
                }
            }
        }
        
        if (foundBeds.length > 0) {
            // Return the most common bed count
            const mostCommon = foundBeds.sort((a,b) => 
                foundBeds.filter(v => v === a).length - foundBeds.filter(v => v === b).length
            ).pop();
            return mostCommon.toString();
        }
        
        return 'INFO_UNAVAILABLE';
    }

    extractBaths(doc) {
        const selectors = [
            '[data-testid="bed-bath-item"]:nth-child(2)',
            '.ds-bed-bath-living-area-container span:nth-child(2)',
            '.zsg-content-header-top-container .zsg-icon-bath + span',
            '[data-testid="bed-bath-beyond-facts"] span:nth-child(2)'
        ];
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element) {
                const match = element.textContent.match(/(\d+(?:\.\d+)?)\s*bath/i);
                if (match) return match[1];
            }
        }
        
        // Fallback: search for bath pattern in text
        const text = doc.body.textContent;
        const bathMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:bath|bathroom)/i);
        if (bathMatch) return bathMatch[1];
        
        return 'INFO_UNAVAILABLE';
    }

    extractYearBuilt(doc) {
        const text = doc.body.textContent;
        const patterns = [
            /Built in (\d{4})/i,
            /Year built:?\s*(\d{4})/i,
            /(\d{4})\s*built/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }
        return 'INFO_UNAVAILABLE';
    }

    extractSqft(doc) {
        const selectors = [
            '[data-testid="bed-bath-item"]:last-child',
            '.ds-bed-bath-living-area-container span:last-child',
            '.zsg-content-header-top-container .zsg-icon-sqft + span',
            '[data-testid="bed-bath-beyond-facts"] span:last-child'
        ];
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element) {
                const match = element.textContent.match(/([\d,]+)\s*sqft/i);
                if (match) return match[1].replace(/,/g, '');
            }
        }
        
        // Fallback: search for sqft pattern in text
        const text = doc.body.textContent;
        const sqftMatch = text.match(/([\d,]+)\s*(?:sqft|sq\.?\s*ft\.?|square feet)/i);
        if (sqftMatch) return sqftMatch[1].replace(/,/g, '');
        
        return 'INFO_UNAVAILABLE';
    }

    extractDaysListed(doc) {
        const text = doc.body.textContent;
        const patterns = [
            /(\d+)\s*days?\s*on\s*(?:zilla|zillow)/i,
            /listed\s*(\d+)\s*days?\s*ago/i,
            /on\s*market\s*(\d+)\s*days?/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }
        return 'INFO_UNAVAILABLE';
    }

    extractCurrentRent(doc) {
        const text = doc.body.textContent.toLowerCase();
        const patterns = [
            /currently renting (?:at|for)\s*\$?([\d,]+)/i,
            /gross rent\s*:?\s*\$?([\d,]+)/i,
            /occupied tenant\s*.*?\$?([\d,]+)/i,
            /leased until\s*.*?\$?([\d,]+)/i,
            /rental income\s*:?\s*\$?([\d,]+)/i,
            /rent\s*:?\s*\$?([\d,]+)/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return '$' + match[1];
        }
        return 'INFO_UNAVAILABLE';
    }

    extractLastSaleDate(doc) {
        const text = doc.body.textContent;
        const patterns = [
            /sold\s*(?:on|in)?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
            /last\s*sold\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
            /sale\s*date\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1];
        }
        return 'INFO_UNAVAILABLE';
    }

    extractLastSalePrice(doc) {
        const text = doc.body.textContent;
        const patterns = [
            /sold\s*(?:for|at)?\s*\$?([\d,]+)/i,
            /last\s*sold\s*(?:for|at)?\s*:?\s*\$?([\d,]+)/i,
            /sale\s*price\s*:?\s*\$?([\d,]+)/i
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return '$' + match[1];
        }
        return 'INFO_UNAVAILABLE';
    }

    extractRealtorName(doc) {
        // First try CSS selectors
        const selectors = [
            '[data-testid="attribution-LISTING_AGENT"] .Text-c11n-8-84-3__sc-aiai24-0',
            '.ds-agent-name',
            '.zsg-pro-name a',
            '.listing-agent-name',
            '[data-testid="attribution-LISTING_AGENT"]',
            '.agent-name',
            '.listing-agent'
        ];
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element) {
                let name = element.textContent.trim();
                
                // Clean the name from CSS selector results too
                name = this.cleanRealtorName(name);
                
                if (name && name.length >= 2 && name.length <= 50) {
                    return name;
                }
            }
        }
        
        // Enhanced fallback: search for various realtor patterns
        const text = doc.body.textContent;
        const realtorPatterns = [
            /Listed\s*by[:\s]*([A-Za-z\s\.\-']+?)(?:\s*\||$|\n|,|\s{2,}|\d)/gi,
            /Listing\s*agent[:\s]*([A-Za-z\s\.\-']+?)(?:\s*\||$|\n|,|\s{2,}|\d)/gi,
            /Agent[:\s]*([A-Za-z\s\.\-']+?)(?:\s*\||$|\n|,|\s{2,}|\d)/gi,
            /Realtor[:\s]*([A-Za-z\s\.\-']+?)(?:\s*\||$|\n|,|\s{2,}|\d)/gi,
            /Contact\s*([A-Za-z\s\.\-']+?)(?:\s*\||$|\n|,|\s{2,}|\d)/gi
        ];
        
        for (const pattern of realtorPatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const cleanedName = this.cleanRealtorName(match[1]);
                if (cleanedName) {
                    return cleanedName;
                }
            }
        }
        
        return 'INFO_UNAVAILABLE';
    }

    cleanRealtorName(rawName) {
        if (!rawName) return null;
        
        let name = rawName.trim();
        
        // Remove all numbers and digits
        name = name.replace(/\d/g, '');
        
        // Remove common unwanted patterns
        name = name.replace(/\b(phone|tel|call|contact|email|@)\b/gi, '');
        
        // Remove special characters except allowed ones
        name = name.replace(/[^\w\s\.\-']/g, ' ');
        
        // Remove multiple spaces and trim
        name = name.replace(/\s+/g, ' ').trim();
        
        // Remove leading/trailing punctuation
        name = name.replace(/^[\.\-']+|[\.\-']+$/g, '');
        
        // Final validation: 2-50 chars, only letters/spaces/dots/hyphens/apostrophes, must have letters
        if (name && 
            name.length >= 2 && 
            name.length <= 50 && 
            /^[A-Za-z\s\.\-']+$/.test(name) &&
            /[A-Za-z]{2,}/.test(name)) { // Must have at least 2 letters
            return name;
        }
        
        return null;
    }

    extractRealtorEmail(doc) {
        const text = doc.body.textContent;
        const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
        const matches = text.match(emailPattern);
        
        if (matches && matches.length > 0) {
            // Filter out common non-realtor emails
            const filtered = matches.filter(email => 
                !email.includes('zilla.com') && 
                !email.includes('zillow.com') && 
                !email.includes('noreply') &&
                !email.includes('support')
            );
            return filtered[0] || 'INFO_UNAVAILABLE';
        }
        return 'INFO_UNAVAILABLE';
    }

    parsePrice(priceStr) {
        if (typeof priceStr !== 'string') return null;
        const match = priceStr.match(/[\d,]+/);
        return match ? parseInt(match[0].replace(/,/g, '')) : null;
    }

    formatPrice(amount) {
        return '$' + amount.toLocaleString();
    }

    updateProgress() {
        const percentage = (this.currentIndex / this.totalUrls) * 100;
        document.getElementById('progressFill').style.width = percentage + '%';
        document.getElementById('progressText').textContent = 
            `${this.currentIndex} / ${this.totalUrls} completed`;
    }

    logStatus(message, type = 'info') {
        const log = document.getElementById('statusLog');
        const item = document.createElement('div');
        item.className = `status-item status-${type}`;
        item.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        log.appendChild(item);
        log.scrollTop = log.scrollHeight;
    }

    showResults() {
        document.getElementById('resultsSection').style.display = 'block';
        
        const successful = this.results.filter(r => r.status === 'SUCCESS').length;
        const failed = this.results.length - successful;
        
        document.getElementById('resultsSummary').innerHTML = 
            `<strong>Scraping Complete!</strong><br>
             Successfully processed: ${successful} properties<br>
             Failed: ${failed} properties<br>
             Total: ${this.results.length} properties`;

        this.populateResultsTable();
    }

    populateResultsTable() {
        const tbody = document.getElementById('resultsBody');
        tbody.innerHTML = '';

        this.results.forEach(result => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${result.address}</td>
                <td>${result.purchasePrice}</td>
                <td>${result.downPayment20}</td>
                <td>${result.estimatedMortgage}</td>
                <td>${result.totalMonthlyPayment}</td>
                <td>${result.beds}</td>
                <td>${result.baths}</td>
                <td>${result.yearBuilt}</td>
                <td>${result.sqft}</td>
                <td>${result.daysListed}</td>
                <td>${result.realtorName ? result.realtorName.trim() : 'INFO_UNAVAILABLE'}</td>
                <td><a href="${result.url}" target="_blank" rel="noopener">${result.url}</a></td>
            `;
        });
    }

    downloadCsv() {
        const headers = [
            'Address', 'Purchase Price', '20% Down Payment', 
            'Est. Mortgage (P&I)', 'Total Monthly (w/ Tax+Ins)', 'Beds', 'Baths', 'Year Built', 'Sqft', 
            'Days Listed', 'Realtor Name', 'URL'
        ];

        const csvContent = [
            headers.join(','),
            ...this.results.map(result => [
                `"${result.address}"`,
                `"${result.purchasePrice}"`,
                `"${result.downPayment20}"`,
                `"${result.estimatedMortgage}"`,
                `"${result.totalMonthlyPayment}"`,
                result.beds,
                result.baths,
                result.yearBuilt,
                result.sqft,
                result.daysListed,
                `"${result.realtorName ? result.realtorName.trim() : 'INFO_UNAVAILABLE'}"`,
                `"${result.url}"`
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Generate filename with local date and time
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const localDateTime = `${year}-${month}-${day}_${hours}-${minutes}`;
        
        a.download = `zilla-scrapa-results-${localDateTime}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    clearAll() {
        document.getElementById('csvFile').value = '';
        document.getElementById('urlText').value = '';
        document.getElementById('progressSection').style.display = 'none';
        document.getElementById('resultsSection').style.display = 'none';
        document.getElementById('statusLog').innerHTML = '';
        this.results = [];
        this.currentIndex = 0;
        this.totalUrls = 0;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the scraper when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ZillaScraper();
});
