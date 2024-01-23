#!/bin/sh
kubectl delete deployment weather-app-deployment -n cst8918
kubectl delete service weather-app-service -n cst8918
kubectl delete secret weather -n cst8918
kubectl delete namespace cst8918
