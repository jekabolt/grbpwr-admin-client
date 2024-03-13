## GRBPWR admin client

## Prerequisites

1. Make sure that you have Node.js installed with yarn.
2. Make sure protoc-gen-typescript-http is installed and present on your $PATH

## Installation and Setup Instructions

1. Clone down this repository.

2. Install packages:

`make install` or `yarn install`

3. Pull and generate proto files:

`cd ./proto/ && git pull origin main && cd .. && make init`

4. To start in dev mode:

`make dev` or `yarn dev`

5. To Visit App:

`localhost:4040`
