## GRBPWR admin client

## Prerequisites

1. Make sure that you have Node.js installed with yarn.
2. Make sure protoc-gen-typescript-http is installed and present on your $PATH

## Installation and Setup Instructions

#### Example:

Clone down this repository.

Installation:
`make install` or `yarn install`

Pull and generate proto files:
`cd ./proto/ && git pull origin main && cd .. && make init`

To start in dev mode:
`make dev` or `yarn dev`

To Visit App:
`localhost:4000`
