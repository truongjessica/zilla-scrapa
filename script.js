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

        return urls;
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

        const urls = this.extractUrls();
        if (urls.length === 0) {
            alert('Please enter valid Zilla URLs');
            return;
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
            
            try {
                this.logStatus(`Processing ${i + 1}/${urls.length}: ${urls[i]}`, 'info');
                const data = await this.scrapeProperty(urls[i]);
                this.results.push(data);
                this.logStatus(`✓ Successfully scraped: ${data.address || 'Unknown address'}`, 'success');
            } catch (error) {
                this.logStatus(`✗ Failed to scrape ${urls[i]}: ${error.message}`, 'error');
                this.results.push({
                    url: urls[i],
                    status: 'ERROR',
                    error: error.message,
                    address: 'INFO_UNAVAILABLE',
                    purchasePrice: 'INFO_UNAVAILABLE',
                    downPayment20: 'INFO_UNAVAILABLE',
                    estimatedMortgage: 'INFO_UNAVAILABLE',
                    beds: 'INFO_UNAVAILABLE',
                    baths: 'INFO_UNAVAILABLE',
                    yearBuilt: 'INFO_UNAVAILABLE',
                    sqft: 'INFO_UNAVAILABLE',
                    daysListed: 'INFO_UNAVAILABLE',
                    realtorName: 'INFO_UNAVAILABLE'
                });
            }

            // Rate limiting - wait 2 seconds between requests
            if (i < urls.length - 1) {
                await this.delay(2000);
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

        const data = {
            url: url,
            status: 'SUCCESS',
            address: this.extractAddress(doc),
            purchasePrice: this.extractPrice(doc),
            downPayment20: 'INFO_UNAVAILABLE',
            estimatedMortgage: this.extractMortgage(doc),
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
                    }
                });
                
                if (response.ok) {
                    this.currentProxyIndex = proxyIndex;
                    return await response.text();
                }
                throw new Error(`HTTP ${response.status}`);
            } catch (error) {
                lastError = error;
                this.logStatus(`Proxy ${proxyIndex + 1} failed, trying next...`, 'info');
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

    extractMortgage(doc) {
        // First try CSS selectors
        const selectors = [
            '[data-testid="monthly-payment"]',
            '.ds-estimate-value',
            '.zsg-tooltip-content .zsg-lg',
            '.mortgage-monthly-payment',
            '[data-testid="mortgage-calculator"] [data-testid="monthly-payment"]'
        ];
        
        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            if (element && element.textContent.includes('$')) {
                const mortgageText = element.textContent.trim();
                const mortgageMatch = mortgageText.match(/\$[\d,]+/);
                if (mortgageMatch) {
                    const amount = parseInt(mortgageMatch[0].replace(/[$,]/g, ''));
                    if (amount >= 500 && amount <= 50000) {
                        return mortgageMatch[0];
                    }
                }
            }
        }
        
        // Enhanced fallback: search for various payment patterns
        const text = doc.body.textContent;
        const mortgagePatterns = [
            /Est\.?\s*payment[:\s]*\$?([\d,]+)/gi,
            /Estimated\s*payment[:\s]*\$?([\d,]+)/gi,
            /Monthly\s*payment[:\s]*\$?([\d,]+)/gi,
            /Payment[:\s]*\$?([\d,]+)(?:\/mo|per month)/gi,
            /\$?([\d,]+)\/mo/gi,
            /Principal\s*&\s*interest[:\s]*\$?([\d,]+)/gi
        ];
        
        const foundPayments = [];
        for (const pattern of mortgagePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const amount = parseInt(match[1].replace(/,/g, ''));
                if (amount >= 500 && amount <= 50000) {
                    foundPayments.push(amount);
                }
            }
        }
        
        if (foundPayments.length > 0) {
            // Return the most common payment amount or the first reasonable one
            const mostCommon = foundPayments.sort((a,b) => 
                foundPayments.filter(v => v === a).length - foundPayments.filter(v => v === b).length
            ).pop();
            return '$' + mostCommon.toLocaleString();
        }
        
        return 'INFO_UNAVAILABLE';
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
            'Est. Mortgage', 'Beds', 'Baths', 'Year Built', 'Sqft', 
            'Days Listed', 'Realtor Name', 'URL'
        ];

        const csvContent = [
            headers.join(','),
            ...this.results.map(result => [
                `"${result.address}"`,
                result.purchasePrice,
                result.downPayment20,
                result.estimatedMortgage,
                result.beds,
                result.baths,
                result.yearBuilt,
                result.sqft,
                result.daysListed,
                `"${result.realtorName ? result.realtorName.trim() : 'INFO_UNAVAILABLE'}"`,
                result.url
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zilla-scrapa-results-${new Date().toISOString().split('T')[0]}.csv`;
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
