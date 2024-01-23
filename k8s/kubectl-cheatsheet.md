kubectl get pods
kubectl get namespaces
kubectl apply -f namespaces.yaml
kubectl delete -f namespaces.yaml
kubectl apply -f deployment.yaml
kubectl get pods -n cst8918
kubectl get pods -n cst8918 -o wide
kubectl describe pod <name-of-pod> -n cst8918
kubectl logs <name-of-pod> -n cst8918
kubectl delete deployment <name-of-deployment> -n cst8918
kubectl apply -f service.yaml
kubectl get services -n cst8918
minikube tunnel
snyk aic

kubectl create secret generic weather --from-literal='api-key=bc2682b67f497cf9a1f5bfbdde7a4ea1' -n cst8918
kubectl get secrets -n cst8918
kubectl describe secret weather -n cst8918
kubectl delete secret weather -n cst8918

## Resources

### Videos

[DevOps Foundations - Containers](https://www.linkedin.com/learning/devops-foundations-containers-14207858)
[Learning Kubernetes](https://www.linkedin.com/learning/learning-kubernetes-16086900)
