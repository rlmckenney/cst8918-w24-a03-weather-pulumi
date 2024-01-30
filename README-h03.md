CST8918 - DevOps: Infrastructure as Code
Prof: Robert McKenney

# Hybrid-H03 Pulumi Weather App (continued)

This is a continuation of the practical lab scenario from Lab-a03. As a reminder, here are the scenario objectives.

## Objectives

### Part One (Lab-A03)

- Use Pulumi to provision the IaC resources
  - Azure Container Registry (ACR)
  - Azure Container Instances (ACI)
- Use Pulumi to package the application into a Docker container and deploy it

### Part Two (Hybrid-H03)

- Add proper secret handling for the OpenWeather API key
- Modify the application code to utilize a shared Redis instance
- Update the Pulumi config to provision additional IaC resources
  - Azure Cache for Redis
- Update the container image version and redeploy with Pulumi

### Starter Repo

You should proceed from where you left off at the end of Lab-A03. Merge your code from the `lab-a03` branch back into the `main` branch, if you haven't done so already, and then make a new branch called `hybrid-h03`. All of the work for this assignment should be done in this branch.

## Part Two (H03) - Encrypt secrets and modify the application to use Redis

### OpenWeather API secret key

Hopefully, leaving your OpenWeather API key unencrypted in the infrastructure code left you with a really icky feeling. It should! And if we really went to production with that, somebody is likely getting fired. Fortunately for us, that was just a temporary checkpoint in completing our solution. Let's look at how to properly handle this and other sensitive configuration items.

We saw in Lab-A01 that with Kubernetes we could use the control plane's `etcd` storage to encrypt/decrypt secrets. This project's solution is not using Kubernetes, so what are the options?

1. Azure **Key Vault** managed service
2. Pulumi **ESC** (Environments, Secrets, and Configuration) managed service
3. Pulumi config command

In a larger and more complicated solution design, you will likely want to use either option 1 or option 2. However, for our purposes in this project, option 3 will serve nicely. It works very similarly to the Kubernetes solution. In the terminal (in the _infrastructure_ folder) run the `pulumi config set` command with the `--secret` option. [See the docs for more details](https://www.pulumi.com/docs/cli/commands/pulumi_config_set/).

```sh
pulumi config set weatherApiKey <your-secret-key> --secret
```

> Of course replace \<your-secret-key\> with your real OpenWeather API key.

To access this secret in the IaC program file (infrastructure/index.ts), modify the environment variables section of the container definition to replace your plain text API key with the config value ...

```ts
          {
            name: 'WEATHER_API_KEY',
            value: config.requireSecret('weatherApiKey')
          }
```

The config object has two methods that will return the unwrapped secret value: `getSecret` and `requireSecret`. By using the require variant, Pulumi will throw an error if the `weatherApiKey` is not set. Also notice that the unwrapped secret is not stored in a local variable like we did with other config values. Consuming it directly where it is needed helps to prevent accidentally exposing the secret.

OK, now test it.

```sh
pulumi up
```

**Success !!**

That feels better :wink:

### Redis - a more robust cache solution

[Redis](https://redis.io/) is a highly performant in-memory database that supports many use cases. For our purposes, it will act as a results cache for OpenWeather API calls. We can use the "[string](https://redis.io/docs/data-types/strings/)" data type to store key:value pairs where the key is the query string prams from the API call and the value is the returned result. The Redis [set](https://redis.io/commands/set/) command is used to set the current value for a given key. It also takes an optional argument to define an expiry time. When a key's expiry time has been exceeded, Redis will automatically purge the key. This will simplify the look-up logic in our application -- we don't need to check if the cache has expired.

#### Add dependencies

The application will need a Redis client library to be able to talk to the database. The official [redis](https://github.com/redis/node-redis) client is fast, supports Typescript and promises.

```sh
npm install redis
```

#### Update the application code

##### 1. Create a database connection and export a reusable client object. Add a new file called `redis-connection.ts` to the `app/data-access` folder.

```ts
import {createClient} from 'redis'

const url = process.env.REDIS_URL || 'redis://localhost:6379'

export const redis = await createClient({url})
  .on('error', err => console.error('Redis client connection error', err))
  .connect()
```

> This will default to connecting to the default Redis port (6379) on localhost.
> We will set the environment variable to the correct value later with Pulumi.

##### 2. Modify the _open-weather-service.ts_ module to use the Redis client instead of the simple in-memory cache.

```ts
import { redis } from '../data-access/redis-connection'

const API_KEY = process.env.WEATHER_API_KEY
const BASE_URL = 'https://api.openweathermap.org/data/3.0/onecall'
const TEN_MINUTES = 1000 * 60 * 10 // in milliseconds

interface FetchWeatherDataParams {
  lat: number
  lon: number
  units: 'standard' | 'metric' | 'imperial'
}
export async function fetchWeatherData({
  lat,
  lon,
  units
}: FetchWeatherDataParams) {
  const queryString = `lat=${lat}&lon=${lon}&units=${units}`

  const cacheEntry = await redis.get(queryString)
  if (cacheEntry) return JSON.parse(cacheEntry)

  const response = await fetch(`${BASE_URL}?${queryString}&appid=${API_KEY}`)
  const data = await response.text() // avoid an unnecessary extra JSON.stringify
  await redis.set(queryString, data, {PX: TEN_MINUTES}) // The PX option sets the expiry time
  return JSON.parse(data)
}
```

##### 3. Test the application changes in your local dev environment.

We ultimately want to deploy this to Azure, but for now you can quickly test the code changes by spinning up a temporary Redis container in your local Docker desktop. In a separate terminal tab, run this command ...

```sh
docker run -p 6379:6379 -it redis/redis-stack-server:latest
```

Then in a different terminal tab, you can run the Remix dev server to test the application.

```sh
npm run dev
```

**Success!**

OK. If that is all working, you should update the version tag for the app container image.

```sh
pulumi config set imageTag "v0.3.0"
```

### Update the IaC Definition

Great! You got the application code updated to use Redis. Now we need to make sure that there is a Redis instance available in the cloud deployment environment. Options?

1. You could add another container instance and run the same Redis container image in it that you used for the local testing. The application container could then talk to it via a private (not internet accessible) IP address.

2. You could use the Azure Cache for Redis managed service. This is more robust and does not require you to manage your own Redis database. It will also support future scaling when we need more than one instance of the application container.

**Let's implement option two.**

> See the [Azure Cache for Redis](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/) documentation.

For this lab activity you can use the `basic` service tier (SKU) to save cost. For a real application your should choose the `premium` teir or higher.

You will need to use the `cache` sub-module from the [Pulumi azzure-native](https://www.pulumi.com/registry/packages/azure-native/api-docs/cache/redis/#package-details) package -- see the linked docs for more details.

Add this Redis cache definition section near the top of your `infrastructure\index.ts` file -- after the resource group definition. It needs to be defined before the container definition so that you can inject the db conection details into the application container.

```ts
import * as cache from '@pulumi/azure-native/cache'
// ... configs and resource group

// Create a managed Redis service
const redis = new cache.Redis(`${prefixName}-redis`, {
  name: `${prefixName}-weather-cache`,
  location: 'westus3',
  resourceGroupName: resourceGroup.name,
  enableNonSslPort: true,
  redisVersion: 'Latest',
  minimumTlsVersion: '1.2',
  redisConfiguration: {
    maxmemoryPolicy: 'allkeys-lru'
  },
  sku: {
    name: 'Basic',
    family: 'C',
    capacity: 0
  }
})
```

In order to construct the Redis connection string required for the app container's REDIS_URL environment variable, you will need to extract the autogenerated "access key" (password) from the Redis service once it is provisioned. Similar to how we obtained the container registry credentials in the previous lab, the `azure-native.cache` module has a function called `listRedisKeysOutput` that you can use.

```ts
// Extract the auth creds from the deployed Redis service
const redisAccessKey = cache
  .listRedisKeysOutput({ name: redis.name, resourceGroupName: resourceGroup.name })
  .apply(keys => keys.primaryKey)

```

Then you can use the `pulumi.interpolate` method to construct the final URL.
> See [Pulumi docs: Working with Outputs and Strings](https://www.pulumi.com/docs/concepts/inputs-outputs/#outputs-and-strings)

```ts
// Construct the Redis connection string to be passed as an environment variable in the app container
const redisConnectionString = pulumi.interpolate`rediss://:${redisAccessKey}@${redis.hostName}:${redis.sslPort}`

```

Finally, set the `REDIS_URL` environment variable in the container group definition section.

```ts
environmentVariables: [
  // existing vars ...
  {
    name: 'REDIS_URL',
    value: redisConnectionString
  }
]
```

#### Time to deploy!

```sh
pulumi up
```

If the plan preview throws any errors, recheck your code for typos. Otherwise, after about 10 - 12 minutes you should have a successful deploy. Using your browser, open the application URL that Pulumi output in the terminal to verify everything is working.

You can also inspect the deployed resources from the Azure console.

Congratulations!!

## Demo / Submit

Take a screenshot of your terminal showing the output of the `pulumi up` command. Add that screenshot to the root of your project folder with the name `pulumi-output.png`.

When you have completed this activity, make sure that you have committed all of your changes with git, and pushed your commits up to GitHub. Remember, this should be on a branch called `hybrid-h03`.

Submit a link to your GitHub repo for this assignment in Brightspace.

## Clean-up!

When you are all done, don't forget to clean up the unneeded Azure resources.

```sh
pulumi destroy
```
