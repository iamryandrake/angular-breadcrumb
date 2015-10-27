'use strict';

function isAOlderThanB(scopeA, scopeB) {
    if(angular.equals(scopeA.length, scopeB.length)) {
        return scopeA > scopeB;
    } else {
        return scopeA.length > scopeB.length;
    }
}

function parseStateRef(ref) {
    var parsed = ref.replace(/\n/g, " ").match(/^([^(]+?)\s*(\((.*)\))?$/);
    if (!parsed || parsed.length !== 4) { throw new Error("Invalid state ref '" + ref + "'"); }
    return { state: parsed[1], paramExpr: parsed[3] || null };
}

function $Breadcrumb() {

    var $$options = {
        prefixStateName: null,
        template: 'bootstrap3',
        templateUrl: null,
        includeAbstract : false
    };

    this.setOptions = function(options) {
        angular.extend($$options, options);
    };

    this.$get = ['$state', '$stateParams', '$rootScope', function($state, $stateParams, $rootScope) {

        var $lastViewScope = $rootScope;

        // Early catch of $viewContentLoaded event
        $rootScope.$on('$viewContentLoaded', function (event) {
            // With nested views, the event occur several times, in "wrong" order
            if(!event.targetScope.olBreadcrumbIgnore &&
                isAOlderThanB(event.targetScope.$id, $lastViewScope.$id)) {
                $lastViewScope = event.targetScope;
            }
        });

        // Get the parent state
        var $$parentState = function(state) {
            // Check if state has explicit parent OR we try guess parent from its name
            var parent = state.parent || (/^(.+)\.[^.]+$/.exec(state.name) || [])[1];
            var isObjectParent = typeof parent === "object";
            // if parent is a object reference, then extract the name
            return isObjectParent ? parent.name : parent;
        };

        // Add the state in the chain if not already in and if not abstract
        var $$addStateInChain = function(chain, stateRef) {
            var conf,
                parentParams,
                ref = parseStateRef(stateRef),
                force = false,
                skip = false;

            for(var i=0, l=chain.length; i<l; i+=1) {
                if (chain[i].name === ref.state) {
                    return;
                }
            }

            conf = $state.get(ref.state);
            // Get breadcrumb options
            if(conf.olBreadcrumb) {
                if(conf.olBreadcrumb.force){ force = true; }
                if(conf.olBreadcrumb.skip){ skip = true; }
            }
            if((!conf.abstract || $$options.includeAbstract || force) && !skip) {
                if(ref.paramExpr) {
                    parentParams = $lastViewScope.$eval(ref.paramExpr);
                }

                conf.olBreadcrumbLink = $state.href(ref.state, parentParams || $stateParams || {});
                chain.unshift(conf);
            }
        };

        // Get the state for the parent step in the breadcrumb
        var $$breadcrumbParentState = function(stateRef) {
            var ref = parseStateRef(stateRef),
                conf = $state.get(ref.state);

            if(conf.olBreadcrumb && conf.olBreadcrumb.parent) {
                // Handle the "parent" property of the breadcrumb, override the parent/child relation of the state
                var isFunction = typeof conf.olBreadcrumb.parent === 'function';
                var parentStateRef = isFunction ? conf.olBreadcrumb.parent($lastViewScope) : conf.olBreadcrumb.parent;
                if(parentStateRef) {
                    return parentStateRef;
                }
            }

            return $$parentState(conf);
        };

        return {

            getTemplate: function(templates) {
                if($$options.templateUrl) {
                    // templateUrl takes precedence over template
                    return null;
                } else if(templates[$$options.template]) {
                    // Predefined templates (bootstrap, ...)
                    return templates[$$options.template];
                } else {
                    return $$options.template;
                }
            },

            getTemplateUrl: function() {
                return $$options.templateUrl;
            },

            getStatesChain: function(exitOnFirst) { // Deliberately undocumented param, see getLastStep
                var chain = [];

                // From current state to the root
                for(var stateRef = $state.$current.self.name; stateRef; stateRef=$$breadcrumbParentState(stateRef)) {
                    $$addStateInChain(chain, stateRef);
                    if(exitOnFirst && chain.length) {
                        return chain;
                    }
                }

                // Prefix state treatment
                if($$options.prefixStateName) {
                    $$addStateInChain(chain, $$options.prefixStateName);
                }

                return chain;
            },

            getLastStep: function() {
                var chain = this.getStatesChain(true);
                return chain.length ? chain[0] : undefined;
            },

            $getLastViewScope: function() {
                return $lastViewScope;
            }
        };
    }];
}

var getExpression = function(interpolationFunction) {
    if(interpolationFunction.expressions) {
        return interpolationFunction.expressions;
    } else {
        var expressions = [];
        angular.forEach(interpolationFunction.parts, function(part) {
            if(angular.isFunction(part)) {
                expressions.push(part.exp);
            }
        });
        return expressions;
    }
};

var registerWatchers = function(labelWatcherArray, interpolationFunction, viewScope, step) {
    angular.forEach(getExpression(interpolationFunction), function(expression) {
        var watcher = viewScope.$watch(expression, function() {
            step.olBreadcrumbLabel = interpolationFunction(viewScope);
        });
        labelWatcherArray.push(watcher);
    });

};

var deregisterWatchers = function(labelWatcherArray) {
    angular.forEach(labelWatcherArray, function(deregisterWatch) {
        deregisterWatch();
    });
};

function BreadcrumbDirective($interpolate, $breadcrumb, $rootScope) {
    var $$templates = {
        bootstrap2: '<ul class="breadcrumb">' +
            '<li ng-repeat="step in steps" ng-switch="$last || !!step.abstract" ng-class="{active: $last}">' +
            '<a ng-switch-when="false" href="{{step.olBreadcrumbLink}}">{{step.olBreadcrumbLabel}}</a>' +
            '<span ng-switch-when="true">{{step.olBreadcrumbLabel}}</span>' +
            '<span class="divider" ng-hide="$last">/</span>' +
            '</li>' +
            '</ul>',
        bootstrap3: '<ol class="breadcrumb">' +
            '<li ng-repeat="step in steps" ng-class="{active: $last}" ng-switch="$last || !!step.abstract">' +
            '<a ng-switch-when="false" href="{{step.olBreadcrumbLink}}">{{step.olBreadcrumbLabel}}</a>' +
            '<span ng-switch-when="true">{{step.olBreadcrumbLabel}}</span>' +
            '</li>' +
            '</ol>'
    };

    return {
        restrict: 'AE',
        replace: true,
        scope: {},
        template: $breadcrumb.getTemplate($$templates),
        templateUrl: $breadcrumb.getTemplateUrl(),
        link: {
            post: function postLink(scope) {
                var labelWatchers = [];

                var renderBreadcrumb = function() {
                    deregisterWatchers(labelWatchers);
                    labelWatchers = [];

                    var viewScope = $breadcrumb.$getLastViewScope();
                    scope.steps = $breadcrumb.getStatesChain();
                    angular.forEach(scope.steps, function (step) {
                        if (step.olBreadcrumb && step.olBreadcrumb.label) {
                            var parseLabel = $interpolate(step.olBreadcrumb.label);
                            step.olBreadcrumbLabel = parseLabel(viewScope);
                            // Watcher for further viewScope updates
                            registerWatchers(labelWatchers, parseLabel, viewScope, step);
                        } else {
                            step.olBreadcrumbLabel = step.name;
                        }
                    });
                };

                $rootScope.$on('$viewContentLoaded', function (event) {
                    if(!event.targetScope.olBreadcrumbIgnore) {
                        renderBreadcrumb();
                    }
                });

                // View(s) may be already loaded while the directive's linking
                renderBreadcrumb();
            }
        }
    };
}
BreadcrumbDirective.$inject = ['$interpolate', '$breadcrumb', '$rootScope'];

function BreadcrumbLastDirective($interpolate, $breadcrumb, $rootScope) {

    return {
        restrict: 'A',
        scope: {},
        template: '{{olBreadcrumbLabel}}',
        compile: function(cElement, cAttrs) {

            // Override the default template if olBreadcrumbLast has a value
            var template = cElement.attr(cAttrs.$attr.olBreadcrumbLast);
            if(template) {
                cElement.html(template);
            }

            return {
                post: function postLink(scope) {
                    var labelWatchers = [];

                    var renderLabel = function() {
                        deregisterWatchers(labelWatchers);
                        labelWatchers = [];

                        var viewScope = $breadcrumb.$getLastViewScope();
                        var lastStep = $breadcrumb.getLastStep();
                        if(lastStep) {
                            scope.olBreadcrumbLink = lastStep.olBreadcrumbLink;
                            if (lastStep.olBreadcrumb && lastStep.olBreadcrumb.label) {
                                var parseLabel = $interpolate(lastStep.olBreadcrumb.label);
                                scope.olBreadcrumbLabel = parseLabel(viewScope);
                                // Watcher for further viewScope updates
                                // Tricky last arg: the last step is the entire scope of the directive !
                                registerWatchers(labelWatchers, parseLabel, viewScope, scope);
                            } else {
                                scope.olBreadcrumbLabel = lastStep.name;
                            }
                        }
                    };

                    $rootScope.$on('$viewContentLoaded', function (event) {
                        if(!event.targetScope.olBreadcrumbIgnore) {
                            renderLabel();
                        }
                    });

                    // View(s) may be already loaded while the directive's linking
                    renderLabel();
                }
            };

        }
    };
}
BreadcrumbLastDirective.$inject = ['$interpolate', '$breadcrumb', '$rootScope'];

function olBreadcrumbTextDirective($interpolate, $breadcrumb, $rootScope) {

    return {
        restrict: 'A',
        scope: {},
        template: '{{olBreadcrumbChain}}',

        compile: function(cElement, cAttrs) {
            // Override the default template if ncyolBreadcrumbText has a value
            var template = cElement.attr(cAttrs.$attr.ncyolBreadcrumbText);
            if(template) {
                cElement.html(template);
            }

            var separator = cElement.attr(cAttrs.$attr.ncyolBreadcrumbTextSeparator) || ' / ';

            return {
                post: function postLink(scope) {
                    var labelWatchers = [];

                    var registerWatchersText = function(labelWatcherArray, interpolationFunction, viewScope) {
                        angular.forEach(getExpression(interpolationFunction), function(expression) {
                            var watcher = viewScope.$watch(expression, function(newValue, oldValue) {
                                if (newValue !== oldValue) {
                                    renderLabel();
                                }
                            });
                            labelWatcherArray.push(watcher);
                        });
                    };

                    var renderLabel = function() {
                        deregisterWatchers(labelWatchers);
                        labelWatchers = [];

                        var viewScope = $breadcrumb.$getLastViewScope();
                        var steps = $breadcrumb.getStatesChain();
                        var combinedLabels = [];
                        angular.forEach(steps, function (step) {
                            if (step.olBreadcrumb && step.olBreadcrumb.label) {
                                var parseLabel = $interpolate(step.olBreadcrumb.label);
                                combinedLabels.push(parseLabel(viewScope));
                                // Watcher for further viewScope updates
                                registerWatchersText(labelWatchers, parseLabel, viewScope);
                            } else {
                                combinedLabels.push(step.name);
                            }
                        });

                        scope.olBreadcrumbChain = combinedLabels.join(separator);
                    };

                    $rootScope.$on('$viewContentLoaded', function (event) {
                        if(!event.targetScope.olBreadcrumbIgnore) {
                            renderLabel();
                        }
                    });

                    // View(s) may be already loaded while the directive's linking
                    renderLabel();
                }
            };

        }
    };
}
olBreadcrumbTextDirective.$inject = ['$interpolate', '$breadcrumb', '$rootScope'];

angular.module('ol-angular-breadcrumbs', ['ui.router.state'])
    .provider('$breadcrumb', $Breadcrumb)
    .directive('olBreadcrumb', BreadcrumbDirective)
    .directive('olBreadcrumbLast', BreadcrumbLastDirective)
    .directive('olBreadcrumbText', olBreadcrumbTextDirective);
