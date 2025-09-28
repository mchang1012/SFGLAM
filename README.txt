Sensory Friendly Makeup Finder - Chrome Extension
=======================================

About
-----
This Chrome extension, "SFGLAM" analyzes Amazon beauty product reviews and calculates a "Makeup Sensory Score." The objective of this project was to make shopping online for neurodivergent individuals who may struggle with hypersensitivity to be able to identify the best non-triggering products. 
The score reflects how sensory-friendly a product is, based on keywords like:
- Positive: fragrance-free, lightweight, non-sticky, soothing
- Negative: greasy, heavy, irritating, strong scent

The extension shows a floating panel on product pages with:
- Product name and type
- Overall score (0–100)
- Positive and negative sensory cues
- Example review snippets

Built With
----------
- JavaScript
- Chrome Extensions API
- HTML5
- CSS3

Getting Started
---------------
To install and run the extension locally:

1. Download or clone this project folder. Make sure it contains:
   - manifest.json
   - contentScript.js
   - background.js
   - icon.png
   - README.txt

2. Open Google Chrome and go to:
   chrome://extensions/

3. Enable "Developer mode" (toggle in top-right).

4. Click "Load unpacked" and select this project folder.

5. The extension will now appear in Chrome with the icon.png logo.

Usage
-----
1. Open an Amazon product page (preferably beauty products).
2. Scroll through the reviews. As reviews load:
   - The floating panel updates in real-time.
   - More reviews = higher confidence in the score.
   - The score accumulates reviews across pages, not just the current one. 
     It also knows to ignore reviews that have already been processed. 

Score Ranges:
- 70–100 = Good sensory-friendly
- 40–69  = Mixed / average
- 0–39   = Poor sensory-friendly

Roadmap
-------
- Add support for Sephora and Ulta.
- Support auto-loading for all Amazon review pages.
- Export scores to CSV or PDF.
- Add "share score" button.

Contact
-------
Marianne Chang
GitHub: https://github.com/github_username/makeup-sensory-score
Email: mariannechang24@gmail.com
