#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DevPipelineStack } from '../lib/dev-pipeline-stack'
import { ProdPipelineStack } from '../lib/prod-pipeline-stack'
import { config as devProperties } from '../env/dev';
import { config as prodProperties } from '../env/prod';

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

new ProdPipelineStack(app, 'ProdPipelineStack', {
  env: {
    account: prodProperties.account,
    region: prodProperties.region,
  },
  devAccount: devProperties.account,
  ...prodProperties
});
