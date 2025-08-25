import axios from "axios";
import * as cheerio from "cheerio";
import {createObjectCsvWriter} from "csv-writer";

const BASE_URL_LIST = "https://www.coldwellbanker.com/city/ca/san-jose/agents";
const BASE_URL_DETAIL = "https://www.coldwellbanker.com";

const csvWriter = createObjectCsvWriter({
    path: "san_jose_agents.csv",
    header: [
        { id: "firstName", title: "First Name" },
        { id: "lastName", title: "Last Name" },
        { id: "email", title: "Email" },
        { id: "mobilePhone", title: "Mobile Phone" },
        { id: "officePhone", title: "Office Phone" },
        { id: "branchName", title: "Office Branch Name" },
        { id: "branchAddress", title: "Office Address" },
        { id: "branchCity", title: "Office City" },
        { id: "branchState", title: "Office State" },
        { id: "branchZip", title: "Office Zipcode" },
    ],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getAgentData(agentData) {
    try {
        // console.log("AGENT BLOCK", agentData);
        const fullName = agentData.fullName;
        const firstName = fullName.split(" ")[0];
        const lastName = fullName.substring(fullName.indexOf(" ") + 1);

        const email = agentData.emailAddress;
        const officePhone = agentData.businessPhoneNumber;
        const mobilePhone = agentData.mobilePhoneNumber ?? agentData.cellPhoneNumber;

        let branchName, branchAddress, branchCity, branchState, branchZip, branchPhone

        const url = BASE_URL_DETAIL+agentData.url;
        console.log(`Scraping profile page → ${url}`);
        const resp = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        if(resp.data) {
            console.log("Page Loaded");
            const $ = cheerio.load(resp.data);
            const pagePropsRaw = $("script#__NEXT_DATA__").text();
            if(pagePropsRaw) {
                const pageProps = JSON.parse(pagePropsRaw).props.pageProps;
                const agentDetail = pageProps.detail.agentDetails;
                // console.log("AGENT DETAIL", agentDetail);
                branchName = agentDetail.officeName;
                branchAddress = agentDetail.physicalAddress.address;
                branchCity = agentDetail.physicalAddress.city;
                branchState = agentDetail.physicalAddress.state;
                branchZip = agentDetail.physicalAddress.zipCode;
                const phoneNumbers = agentDetail.primaryOffice.phoneNumbers;
                for(const phoneNumber of phoneNumbers) {
                    if(phoneNumber.phoneType === "OfficePhone") {
                        branchPhone = phoneNumber.phoneNumber;
                        break;
                    }
                }
            }
        }
        const ret = { firstName, lastName, email, mobilePhone, officePhone, branchName, branchAddress, branchCity, branchState, branchZip };
        console.log("RETURN DATA", ret);
        return ret;
    } catch (err) {
        console.error("Failed to parse profile", err.message);
        return {
            firstName: "",
            lastName: "",
            email: "",
            mobile: "",
            office: "",
            branchName: "",
            branchAddress: "",
            branchCity: "",
            branchState: "",
            branchZip: "",
        };
    }
}

const numPages = 141;

async function scrapeAllPages() {
    const results = [];

    for (let page = 141; page <= numPages; page++) {
        const url = page === 1 ? BASE_URL_LIST : `${BASE_URL_LIST}/?page=${page}`;
        console.log(`Scraping list page ${page} → ${url}`);

        try {
            const { data } = await axios.get(url, {
                headers: { "User-Agent": "Mozilla/5.0" },
            });
            const $ = cheerio.load(data);
            const pagePropsRaw = $("script#__NEXT_DATA__").text();
            if(!pagePropsRaw) {
                console.log("NO PAGE DATA");
                continue;
            }
            const pageProps = JSON.parse(pagePropsRaw);
            const agentBlocks = pageProps.props.pageProps.results.agents;

            for (let i = 0; i < agentBlocks.length; i++) {
                const agentData = await getAgentData(agentBlocks[i]);
                results.push(agentData);
            }
        } catch (err) {
            console.error(`Failed to scrape page ${page}:`, err.message);
        }
    }

    await csvWriter.writeRecords(results);
    console.log("✅ Done. CSV written to sacramento_agents.csv");
}

scrapeAllPages();