import * as docker from '@pulumi/docker'
import * as pulumi from "@pulumi/pulumi";
import * as containerinstance from '@pulumi/azure-native/containerinstance'
import * as resources from '@pulumi/azure-native/resources'
import * as containerregistry from '@pulumi/azure-native/containerregistry'


// Import the configuration settings for the current stack.
const config = new pulumi.Config()
const appPath = config.get('appPath') || '../'
const prefixName = config.get('prefixName') || 'cst8918a03sola0050'
const imageName = prefixName
const imageTag = config.get('imageTag') || 'latest'
// Azure container instances (ACI) service does not yet support port mapping
// so, the containerPort and publicPort must be the same
const containerPort = config.getNumber('containerPort') || 80
const publicPort = config.getNumber('publicPort') || 80
const cpu = config.getNumber('cpu') || 1
const memory = config.getNumber('memory') || 2

// Create a resource group.
const resourceGroup = new resources.ResourceGroup(`${prefixName}-rg`)

// Create the container registry.
const registry = new containerregistry.Registry(`${prefixName}ACR`, {
  resourceGroupName: resourceGroup.name,
  adminUserEnabled: true,
  sku: {
    name: containerregistry.SkuName.Basic
  }
})

// Get the authentication credentials for the container registry.
const registryCredentials = containerregistry
  .listRegistryCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name
  })
  .apply(creds => {
    return {
      username: creds.username!,
      password: creds.passwords![0].value!
    }
  })

// Define the container image for the service.
  const image = new docker.Image(`${prefixName}-image`, {
    imageName: pulumi.interpolate`${registry.loginServer}/${imageName}:${imageTag}`,
    build: {
      context: appPath,
      platform: 'linux/amd64'
    },
    registry: {
      server: registry.loginServer,
      username: registryCredentials.username,
      password: registryCredentials.password
    }
  })

  // Create a container group in the Azure Container App service and make it publicly accessible.
const containerGroup = new containerinstance.ContainerGroup(
    `${prefixName}-container-group`,
    {
      resourceGroupName: resourceGroup.name,
      osType: 'linux',
      restartPolicy: 'always',
      imageRegistryCredentials: [
        {
          server: registry.loginServer,
          username: registryCredentials.username,
          password: registryCredentials.password
        }
      ],
      containers: [
        {
          name: imageName,
          image: image.imageName,
          ports: [
            {
              port: containerPort,
              protocol: 'tcp'
            }
          ],
          environmentVariables: [
            {
              name: 'PORT',
              value: containerPort.toString()
            },
            {
              name: 'WEATHER_API_KEY',
              value: 'f6b0828ea3a22d8418224d475fee6f89'
            }
          ],
          resources: {
            requests: {
              cpu: cpu,
              memoryInGB: memory
            }
          }
        }
      ],
      ipAddress: {
        type: containerinstance.ContainerGroupIpAddressType.Public,
        dnsNameLabel: `${imageName}`,
        ports: [
          {
            port: publicPort,
            protocol: 'tcp'
          }
        ]
      }
    }
  )

  // Export the service's IP address, hostname, and fully-qualified URL.
export const hostname = containerGroup.ipAddress.apply(addr => addr!.fqdn!)
export const ip = containerGroup.ipAddress.apply(addr => addr!.ip!)
export const url = containerGroup.ipAddress.apply(
  addr => `http://${addr!.fqdn!}:${containerPort}`
)







