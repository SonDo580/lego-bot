#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { LegoBotWithCdkStack } from "../lib/lego-bot-with-cdk-stack";

const app = new cdk.App();
new LegoBotWithCdkStack(app, "LegoBotWithCdkStack", {});
