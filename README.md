CST8918 - DevOps: Infrastructure as Code  
Prof: Robert McKenney

# LAB-A01 Weather App

In this hands-on lab activity we will lay the foundations for adopting infrastructure as code (IaC) using a simple Node.js based web application and Kubernetes on Docker Desktop.

## Objectives

- Review general application requirements and solution implementation choices
- Review the benefits of containerization
- Get an introduction to Kubernetes

## Part 1 - Web Application

### Scenario

You are a software engineer and your company wants to create a new web application that will display the current weather conditions for a given location (because there just aren't enough weather apps on the market :smiley:).

Your team decides to use the [OpenWeather API](https://openweathermap.org) as the source of weather data. Calls to this API require an API Key (access token) which should remain private. To avoid exposing this API Key to the browser, the solution will require a backend API server to proxy the calls to OpenWeather.

Additionally, your Product Manager has asked the team to ensure that the app does not exceed the OpenWeather API free tier limits.

### Implementation Choices

The team is most experienced with React for frontend development; and since a simple backend API will also be needed, the [Remix](https://remix.run) meta framework is selected. Hey if it is good enough for Shopify, it is good enough for us.

To manage the OpenWeather API limits, the Remix loader route will need to implement some results caching.

- initial implementation: in-memory cache object
- eventual implementation: Redis shared cache for scalability

### Dev pre-requisites

- [Git CLI](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
- The current LTS version of [Node.js](https://nodejs.org/en) (20.x.x)
- [Docker Desktop](https://docs.docker.com/get-docker/) with a free Docker Hub account
- Code editor, e.g. [VS Code](https://code.visualstudio.com/download)
- [Kubernetes CLI (kubectl)](https://kubernetes.io/docs/tasks/tools/install-kubectl-macos/)

### TODO

- sign-up for a free account at [OpenWeather API](https://openweathermap.org)
- subscribe to the _One Call API 3.0_ option
- create a new API key
- set a local environment variable in your terminal called `WEATHER_API_KEY` with the value of your API key. It will be needed later.

### Test the application

Your team lead has created an initial implementation, which is ready for you to test.

- fork the [GitHub repo](https://github.com/rlmckenney/cst8918-w24-a01-weather)
- clone a local copy of your forked repo
- start the dev server with `npm run dev`
- open link displayed in your terminal with a browser, e.g. http://localhost:59287

You can terminate the dev server by typing `CTL-C` in the terminal when you are done.

## Part 2 - Kubernetes Deployment

Now that we have a running prototype for the application, it is time to think about how to deploy it. As with most web apps and microservices, our Weather App will be packaged and deployed as a Docker container. This will allow a consistent runtime for local dev testing, continuous integration (CI) testing, and continuous deployment (CD) into one of our cloud IaaS providers (AWS, Azure, GCP).

To make the process of packaging and deploying our containers consistent, repeatable and fast, we need some automation tools. The most common container orchestration tool is [Kubernetes](https://kubernetes.io), and that is what we will use.

### Create a container image

Reference: [What are containers?](https://www.docker.com/resources/what-container/#:~:text=A%20Docker%20container%20image%20is,tools%2C%20system%20libraries%20and%20settings.)

#### Dockerfile

The Dockerfile describes the runtime environment for our application including OS version, application code, and any dependency libraries. The container images are build in multiple steps (layers) so that minimal deltas can be distributed as the application evolves over time.

Review the Dockerfile included at the top level of your project files.

#### Build the container image

In the terminal, at the top level of your project, run the `docker build --tag=cst8918-a01-weather-app .` command. This will tell the docker engine to look for the default `Dockerfile` in the current directory and use those instructions to create the Docker container image. When that is complete, the image will be tagged with the name `cst8918-a01-weather-app:latest`.

#### Test the container

Quickly deploy an instance of the container using Docker desktop.

```sh
docker run -d --name weather -p 8080:8080 --env WEATHER_API_KEY=<your-api-key> cst8918-01-weather-app
```

Then open `http://localhost:8080` in a browser to make sure that the container is working as expected.
If everything is working, you can stop the container with `docker stop weather`. If the container is not working as expected, review the earlier steps carefully and try again.

#### Push the container image to the registry

If this is your first time using Docker Hub, you will need to authenticate with Docker Hub first.

```sh
docker login docker.io
```

Then tag the container image with an alias that is prefixed with your Docker Hub username, and push that to the Docker Hub container registry.

```sh
docker tag cst8918-a01-weather-app <docker-hub-username>/cst8918-a01-weather-app
docker push <docker-hub-username>/cst8918-a01-weather-app
```

### Working with Kubernetes Locally

- enable Kubernetes in Docker Desktop
- [install kubectl](https://kubernetes.io/docs/tasks/tools/) (kubernetes CLI)

Add a new folder to the project where we can put all of the kubernetes related code, called `k8s`.

Make sure that kubectl is talking to Docker Desktop

```sh
kubectl config use-context docker-desktop
```

#### Namespace

Namespaces help to isolate container workloads that share host nodes. Create a namespace for this class `cst8918`.
Create a new file `k8s/a01_namespace.yaml` with the following content.

```yaml
---
apiVersion: v1
kind: Namespace
metadata:
  name: cst8918
```

Activate that namespace with the `kubectl apply ./k8s/a01_namespace.yaml` command in the terminal.

#### Deployment

This describes the application workload: container image, container count, CPU and memory limits, ports, etc.
Create a `a01_deployment.yaml` file in the `k8s` folder.

```yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: weather-app-deployment
  namespace: cst8918
  labels:
    app: weather-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: weather-app
  # This is the pod template
  template:
    metadata:
      labels:
        app: weather-app
    spec:
      containers:
        - name: weather-app-container
          # this is the Docker image that you created
          image: <your-docker-hub-username>/cst8918-a01-weather-app:latest
          ports:
            - containerPort: 8080
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: POD_NAMESPACE
              valueFrom:
                fieldRef:
                  fieldPath: metadata.namespace
            - name: POD_IP
              valueFrom:
                fieldRef:
                  fieldPath: status.podIP
```

##### API Key secret

The API key can be created as a [Kubernetes environment encrypted secret](https://kubernetes.io/docs/concepts/configuration/secret/) and then injected into the containers at runtime.

Run `kubectl create secret generic weather --from-literal='api-key=<your-secret-api-key>' -n cst8918` in the terminal, and then add this to the _env_ section of the deployment file ...

```yaml
- name: WEATHER_API_KEY
  valueFrom:
    secretKeyRef:
      name: weather
      key: api-key
```

Activate the deployment with `kubectl apply ./k8s/a01_deployment.yaml -n cst8918`. The `-n` flag tells Kubernetes to use the namespace that we defined earlier.

#### Service

Now that you have the application containers deployed, the last step is to define a _service_ that will provide an ingress port and act as a load balancer for the running containers.

Allow incoming traffic on the standard HTTP port (80) and have the load balancer forward traffic to the containers on target port 8080.

Create `k8s/a01_service.yaml` with

```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: weather-app-service
  namespace: cst8918
spec:
  selector:
    app: weather-app
  ports:
    - port: 80
      targetPort: 8080
  type: LoadBalancer
```

Activate the service with `kubectl apply ./k8s/a01_service.yaml -n cst8918`. Now test it by opening `http:localhost` in a browser.

#### Clean-up

When you are all done, shut down all of the resources that are no longer needed.

```sh
#!/bin/sh
kubectl delete deployment weather-app-deployment -n cst8918
kubectl delete service weather-app-service -n cst8918
kubectl delete secret weather -n cst8918
kubectl delete namespace cst8918
```

## Demo

For grading this lab activity please show the following to your lab teacher:

- Browser with the app running at `http://localhost`
- all files in the `k8s` folder
- `kubectl get namespaces`
- `kubectl get services -n cst8918`
- `kubectl get pods -n cst8918`
