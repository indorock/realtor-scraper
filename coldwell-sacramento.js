import axios from "axios";
import puppeteer from 'puppeteer';
import * as cheerio from "cheerio";
import {createObjectCsvWriter} from "csv-writer";
const BASE_URL = "https://www.coldwellbankerhomes.com/ca/sacramento/agents";

const browser = await puppeteer.launch();
const puppeteerPage = await browser.newPage();
puppeteerPage.on('request', req => {
    if(req.url().indexOf(BASE_URL) !== -1) {
        // console.log(`📡 Request: ${req.method()} ${req.url()}`);
    }
});


const csvWriter = createObjectCsvWriter({
    path: "sacramento_agents.csv",
    header: [
        { id: "firstName", title: "First Name" },
        { id: "lastName", title: "Last Name" },
        { id: "email", title: "Email" },
        { id: "mobile", title: "Mobile Phone" },
        { id: "office", title: "Office Phone" },
        { id: "direct", title: "Direct Line" },
        { id: "branchName", title: "Office Branch Name" },
        { id: "branchAddress", title: "Office Address" },
        { id: "branchCity", title: "Office City" },
        { id: "branchState", title: "Office State" },
        { id: "branchZip", title: "Office Zipcode" },
    ],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAgentProfile(url) {
    try {
        const { data } = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        const $ = cheerio.load(data);

        const name = $("h1").first().text().trim();
        const firstName = name.split(" ")[0];
        const lastName = name.substring(name.indexOf(" ") + 1);

        const email = $("a[href^='mailto:']").text().trim() || "";
        const phoneBlocks = $("a.phone-link");
        let mobile = "";
        let office = "";
        let direct = "";

        phoneBlocks.each((i, el) => {
            const parent = $(el).parent().parent();
            const label = $(parent).find("i").text().trim().toLowerCase();
            const phone = $(el).text().trim();
            if (label.includes("mobile")) mobile = phone;
            else if (label.includes("office")) office = phone;
            else if (label.includes("direct")) direct = phone;
        });

        const officeSpan = $(".office-span");
        // console.log("OFFICE SPAN", officeSpan.eq(0));
        const branchName = $(officeSpan).eq(0).find('a').text().trim() || " ";
        let branchAddress = $(officeSpan).eq(0).text().trim() || "";
        branchAddress = branchAddress.replace(/\n/g, "");
        const branchPhone = branchAddress.match(/\(\d{3}\) \d{3}-\d{4}/)[0];
        branchAddress = branchAddress.substring(branchName.length, branchAddress.indexOf(branchPhone));
        let branchZip = branchAddress.substring(branchAddress.length-5);
        branchAddress = branchAddress.substring(0, branchAddress.indexOf(branchZip));
        let branchState = branchAddress.substring(branchAddress.lastIndexOf(",")+1).trim();
        branchAddress = branchAddress.substring(0, branchAddress.lastIndexOf(","));
        let branchCity = branchAddress.substring(branchAddress.lastIndexOf(",")+1).trim();
        branchAddress = branchAddress.substring(0, branchAddress.lastIndexOf(","));
        const ret = {
            firstName,
            lastName,
            email,
            mobile,
            office,
            direct,
            branchName,
            branchAddress,
            branchCity,
            branchState,
            branchZip,
            branchPhone,
        };
        console.log("RETURN DATA", ret);
        return ret
    } catch (err) {
        console.error("Failed to parse profile", url, err.message);
        return {
            firstName: "",
            lastName: "",
            email: "",
            mobile: "",
            office: "",
            direct: "",
            branchName: "",
            branchAddress: "",
            branchCity: "",
            branchState: "",
            branchZip: "",
            branchPhone: "",
        };
    }
}

const numPages = 27;

async function scrapeAllPages() {
    const results = [];
    let url = BASE_URL;

    // set the sort order to last name
    const browser = await puppeteer.launch({ headless: true });
    await puppeteerPage.goto(url, { waitUntil: 'networkidle2' });
    await puppeteerPage.waitForSelector('#SortOptionDDL');
    await puppeteerPage.select('#SortOptionDDL', 'L');

    // Wait for the page to reload or DOM update – use a suitable wait method
    await puppeteerPage.waitForNavigation({ waitUntil: 'networkidle2' });
    await removeCookieModal();

    for (let page = 1; page <= numPages; page++) {
        console.log(`Scraping list page ${page} → ${url}`);

        try {
            if(page > 1) {
                const nextExists = await puppeteerPage.$('.next');
                if (!nextExists) {
                    console.log('🚫 No more pages.');
                    break;
                }
                puppeteerPage.screenshot({ path: 'before-click.png' });
                await puppeteerPage.evaluate(() => {
                    document.querySelector('.next').click();
                });
                await puppeteerPage.waitForNavigation({ waitUntil: 'networkidle2' });
                await removeCookieModal();
                puppeteerPage.screenshot({ path: 'after-click.png' });
            }
            const content = await puppeteerPage.content();
            const $ = cheerio.load(content);
            const agentBlocks = $(".agent-block h2 a");

            for (let i = 0; i < agentBlocks.length; i++) {
                const href = $(agentBlocks[i]).attr("href");
                if (!href) continue;

                const profileUrl = "https://www.coldwellbankerhomes.com" + href;
                console.log(` → Fetching ${profileUrl}`);
                const agentData = await fetchAgentProfile(profileUrl);
                results.push(agentData);
                await delay(1000); // polite delay
            }
        } catch (err) {
            console.error(`Failed to scrape page ${page}:`, err.message);
        }
    }

    await csvWriter.writeRecords(results);
    console.log("✅ Done. CSV written to sacramento_agents.csv");
    await browser.close();
    process.exit();

}


const removeCookieModal = async () => {
    await puppeteerPage.evaluate(() => {
        if (document.querySelector('.truste_overlay')) {
            console.log('truste overlay found');
            document.querySelector('.truste_overlay').remove();
            document.querySelector('.truste_box_overlay').remove();
        }
    });
}
scrapeAllPages();