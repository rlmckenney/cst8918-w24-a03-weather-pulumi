# base node image
FROM node:lts-alpine as base

# set for base and all layer that inherit from it
ENV NODE_ENV production

# Install openssl for Prisma
# RUN apk -U add --update-cache openssl sqlite

# Create user and set ownership and permissions as required
RUN <<EOT 
addgroup student && 
adduser -D -H -g "student" -G student student && 
mkdir /cst8918-a01 && 
chown -R student:student /cst8918-a01
EOT

# Install all node_modules, including dev dependencies
FROM base as deps

WORKDIR /cst8918-a01

ADD package.json ./
RUN npm install --include=dev

# Setup production node_modules
FROM base as production-deps

WORKDIR /cst8918-a01

COPY --from=deps /cst8918-a01/node_modules /cst8918-a01/node_modules
ADD package.json ./
RUN npm prune --omit=dev

# Build the app
FROM base as build

WORKDIR /cst8918-a01

COPY --from=deps /cst8918-a01/node_modules /cst8918-a01/node_modules

ADD . .
RUN npm run build

# Finally, build the production image with minimal footprint
FROM base

ENV PORT="8080"
ENV NODE_ENV="production"
# BONUS: This should be injected at runtime from a secrets manager
# We will review the solution next class
# ENV WEATHER_API_KEY="bc2682b67f497cf9a1f5bfbdde7a4ea1"

WORKDIR /cst8918-a01

COPY --from=production-deps /cst8918-a01/node_modules /cst8918-a01/node_modules

COPY --from=build /cst8918-a01/build /cst8918-a01/build
COPY --from=build /cst8918-a01/public /cst8918-a01/public
COPY --from=build /cst8918-a01/package.json /cst8918-a01/package.json

RUN chown -R student:student /cst8918-a01
USER student
CMD [ "/bin/sh", "-c", "./node_modules/.bin/remix-serve ./build/index.js" ]
