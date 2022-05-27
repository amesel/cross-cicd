import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';

interface ProdPipelineStackProps extends StackProps {
  account: string,
  region: string,
  repositoryArn: string,
  branch: string,
  crossAccessRoleArn: string,
  deployBucketName: string,
  devAccount: string,
}

export class ProdPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: ProdPipelineStackProps) {
    super(scope, id, props);

    const crossAccessRole = iam.Role.fromRoleArn(
      this,
      `${id}-cross-access-role`,
      props.crossAccessRoleArn,
    )

    const sourceOutput = new codepipeline.Artifact()

    const repository = codecommit.Repository.fromRepositoryArn(
      this,
      `${id}-repo`,
      props.repositoryArn
    )

    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: 'codecommit',
      repository: repository,
      output: sourceOutput,
      branch: props.branch,
      trigger: codepipeline_actions.CodeCommitTrigger.NONE,
      role: crossAccessRole,
    })

    const deployRole = new iam.Role(this, `${id}-deploy-role`, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    })
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket'],
      resources: [`arn:aws:s3:::${props.deployBucketName}`],
    }));
    deployRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [`arn:aws:s3:::${props.deployBucketName}/*`],
    }));

    const deployDefinition = new codebuild.PipelineProject(
      this,
      `${id}-deploy`,
      {
        buildSpec: codebuild.BuildSpec.fromSourceFilename('./buildspec.yml'),
        role: deployRole,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        }
      }
    )

    const deployAction = new codepipeline_actions.CodeBuildAction({
      actionName: 'deploy',
      input: sourceOutput,
      project: deployDefinition
    })

    const key = new kms.Key(this, `${id}-artifact-key`, {
      enableKeyRotation: true,
      alias: `cross-cicd-artifact-key`
    })

    const artifactBucket = new s3.Bucket(this, `${id}-artifact-bucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      bucketKeyEnabled: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      bucketName: `cross-cicd-artifact-bucket-${props.account}`,
      enforceSSL: true,
    })

    artifactBucket.grantReadWrite(new iam.ArnPrincipal(crossAccessRole.roleArn))

    const pipeline = new codepipeline.Pipeline(this, `${id}-pipeline`, {
      artifactBucket: artifactBucket,
      stages: [
        {
          stageName: 'source',
          actions: [sourceAction]
        },
        {
          stageName: 'deploy',
          actions: [deployAction]
        }
      ]
    })

    NagSuppressions.addResourceSuppressions(artifactBucket, [
      { id: "AwsSolutions-S1", reason: "Suppress all AwsSolutions-S1 findings" }
    ])

    NagSuppressions.addResourceSuppressions(artifactBucket, [
      { id: "AwsSolutions-S2", reason: "Suppress all AwsSolutions-S2 findings" }
    ])

  }
}
