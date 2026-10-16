# Project Scope

## Goal

<What are we building and why? One or two sentences.>
- Big customer goal is creating a CPQ solution from scratch, the brain is a Databricks App.
- We will only build a POC

## Business Requirements
- The POC will prove that the Pages API can be used to create dynamics pages for quote being generated in their CPQ system
- For their CPQ system we need a fake Single Page App (SPA) that uses vanilla JS + HTML to simulate a simple Quoting tool.
- The Slug for the quote should be completely random (so it can't be guessed)
- The Landing page should leverage an expiration date (30 days) (The Pages API supports expiration dates)
- It should also allow to set a password (The Pages API support this)
- The SPA needs to retrieve the quote url and provide it in the user interface so we can open it for testing
- The SPA must also offer a delete button to remove the Landing Page for that quote

## In Scope

- <Item>

## Out of Scope

- We are not setting up Databricks
- We are not setting up a cloud hosted environment. The Poc needs to run locally

## Constraints & Assumptions



## Acceptance Criteria

- <How we know it is done>
- We can enter basic data into the SPA to create a fictious quote
- We can submit the quote via a submit button and it creates a landing page via the Pages API that used the template and filled the placeholders
- the slug
## Open Questions

- <Question>
- We need to setup the right API Service Key with the right scopes
- We likely need UNIT Tests
- can the template be created programmtically as part of this agentic project?
- Can we put the CQP simulator into an App Card or an App inside Hubspot?
    - What would this require?
    - How would setting up auto_deploy and auto_refresh work?
