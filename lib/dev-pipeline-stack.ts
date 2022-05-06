import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
// import * as events from 'aws-cdk-lib/aws-events';
// import * as targets from 'aws-cdk-lib/aws-events-targets';

interface DevPipelineStackProps extends StackProps {
  account: string,
  region: string,
  repositoryName: string,
  branch: string,
  crossAccountRoleName: string,
  prodAccount: string,
  prodRegion: string,
}

export class DevPipelineStack extends Stack {
  public repositoryArn: string
  public crossAccessRoleArn: string
  constructor(scope: Construct, id: string, props: DevPipelineStackProps) {
    super(scope, id, props);

    const sourceOutput = new codepipeline.Artifact()

    const repository = codecommit.Repository.fromRepositoryName(
      this,
      `${id}-repo`,
      props.repositoryName
    )

    const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
      actionName: `codecommit`,
      repository: repository,
      output: sourceOutput,
      branch: props.branch,
      trigger: codepipeline_actions.CodeCommitTrigger.NONE,
    })

    const deployRole = new iam.Role(this, `${id}-deploy-role`, {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      managedPolicies: [
        { managedPolicyArn: 'arn:aws:iam::aws:policy/PowerUserAccess' }
      ],
      inlinePolicies: {
        [`${id}-inline-policies`]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['iam:*'],
              resources: ['*']
            })
          ]
        })
      }
    })

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
      actionName: `deploy`,
      input: sourceOutput,
      project: deployDefinition
    })

    new codepipeline.Pipeline(this, `${id}-pipeline`, {
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

    const crossAccessRole = new iam.Role(this, `${id}-cross-access-role`, {
      roleName: props.crossAccountRoleName,
      assumedBy: new iam.AccountPrincipal(props.prodAccount)
    })

    crossAccessRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['codecommit:*', 's3:*', 'kms:*'],
        resources: ['*']
      })
    )

    // repository.onStateChange(`${id}-state-change-event`, {
    //   target: new targets.EventBus(
    //     events.EventBus.fromEventBusArn(
    //       this,
    //       'External',
    //       `arn:aws:events:${props.prodRegion}:${props.prodAccount}:event-bus/default`
    //     )
    //   )
    // })

    this.repositoryArn = repository.repositoryArn
    this.crossAccessRoleArn = crossAccessRole.roleArn

    new CfnOutput(this, `${id}-repository-arn`, {
      value: this.repositoryArn
    })

    new CfnOutput(this, `${id}-cross-access-role-arn`, {
      value: this.crossAccessRoleArn
    })

  }
}
