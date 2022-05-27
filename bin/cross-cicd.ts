#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DevPipelineStack } from '../lib/dev-pipeline-stack'
import { ProdPipelineStack } from '../lib/prod-pipeline-stack'
import { config as devProperties } from '../env/dev';
import { config as prodProperties } from '../env/prod';
import { AwsSolutionsChecks } from 'cdk-nag'
import { Aspects } from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';

const app = new cdk.App();

new DevPipelineStack(app, 'DevPipelineStack', {
  env: {
    account: devProperties.account,
    region: devProperties.region,
  },
  prodAccount: prodProperties.account,
  prodRegion: prodProperties.region,
  ...devProperties
});

const prod = new ProdPipelineStack(app, 'ProdPipelineStack', {
  env: {
    account: prodProperties.account,
    region: prodProperties.region,
  },
  devAccount: devProperties.account,
  ...prodProperties
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))

NagSuppressions.addStackSuppressions(prod, [
  { id: 'AwsSolutions-IAM5', reason: 'Suppress all AwsSolutions-IAM5 findings' },
]);